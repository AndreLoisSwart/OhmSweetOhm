"""Revisions: the design's placements and wires saved before a change, so it can be undone.

- Claude: a revision before every change, with a summary of it (build step 7).
- The canvas: one per editing session, before the first change after 10 minutes of quiet.
- Restoring saves the current state first, so a restore can be undone too.
- The latest 50 are kept.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import NotFoundError
from app.modules.designs.models import Design, Placement, Revision, Wire
from app.modules.designs.schemas import (
    PlacementSnapshot,
    RevisionOut,
    Snapshot,
    WireSnapshot,
)
from app.modules.parts.models import Author, Part

QUIET = timedelta(minutes=10)
KEEP = 50
SESSION_SUMMARY = "Before editing on the canvas"


def snapshot_of(design: Design) -> Snapshot:
    return Snapshot(
        placements=[
            PlacementSnapshot(
                ref=p.ref, part_id=p.part_id, x=p.x, y=p.y, rotation=p.rotation, note=p.note
            )
            for p in design.placements
        ],
        wires=[
            WireSnapshot(
                a=f"{w.a_placement.ref}.{w.a_pin.name}",
                b=f"{w.b_placement.ref}.{w.b_pin.name}",
                a_pin_id=w.a_pin_id,
                b_pin_id=w.b_pin_id,
                color=w.color,
                label=w.label,
            )
            for w in design.wires
        ],
    )


def save_revision(session: Session, design: Design, author: Author, summary: str) -> Revision:
    """Saves the design as it is now. The caller commits, along with its change."""
    revision = Revision(
        created_at=utcnow(),
        author=author,
        summary=summary[:200],
        snapshot=snapshot_of(design).model_dump(mode="json"),
    )
    design.revisions.insert(0, revision)
    # The latest KEEP stay; older ones go (delete-orphan).
    del design.revisions[KEEP:]
    return revision


def before_canvas_change(session: Session, design: Design) -> None:
    """A revision at the start of an editing session: the first change after QUIET."""
    now = utcnow()
    latest = design.revisions[0].created_at if design.revisions else None
    if now - design.updated_at < QUIET or (latest and now - latest < QUIET):
        return
    save_revision(session, design, Author.USER, SESSION_SUMMARY)


def apply_snapshot(session: Session, design: Design, snapshot: Snapshot) -> None:
    """Makes the design's placements and wires match the snapshot.

    Placements are matched by ref, so unchanged parts keep their ids. Anything that no
    longer exists (a deleted part, a removed pin) is left out rather than refused, so an
    old revision can always be restored.
    """
    design.wires.clear()
    session.flush()
    parts = {
        part.id: part
        for part in session.scalars(
            select(Part).where(Part.id.in_({p.part_id for p in snapshot.placements}))
        )
    }
    wanted = {p.ref: p for p in snapshot.placements if p.part_id in parts}
    for placement in list(design.placements):
        keep = wanted.get(placement.ref)
        if keep is None or keep.part_id != placement.part_id:
            design.placements.remove(placement)
    session.flush()
    by_ref = {p.ref: p for p in design.placements}
    for ref, item in wanted.items():
        placement = by_ref.get(ref)
        if placement is None:
            placement = Placement(ref=ref, part=parts[item.part_id])
            design.placements.append(placement)
            by_ref[ref] = placement
        placement.x, placement.y = item.x, item.y
        placement.rotation, placement.note = item.rotation, item.note
    session.flush()

    joined: set[frozenset] = set()
    for item in snapshot.wires:
        a = _resolve(by_ref, item.a, item.a_pin_id)
        b = _resolve(by_ref, item.b, item.b_pin_id)
        if a is None or b is None:
            continue
        ends = frozenset({(a[0].id, a[1].id), (b[0].id, b[1].id)})
        if len(ends) == 1 or ends in joined:
            continue
        joined.add(ends)
        design.wires.append(
            Wire(
                a_placement=a[0],
                a_pin=a[1],
                b_placement=b[0],
                b_pin=b[1],
                color=item.color,
                label=item.label,
            )
        )
    design.updated_at = utcnow()


def _resolve(by_ref: dict[str, Placement], pin_ref: str, pin_id: int | None):
    ref, name = pin_ref.split(".", 1)
    placement = by_ref.get(ref.lower())
    if placement is None:
        return None
    pins = placement.part.pins
    pin = next((p for p in pins if p.id == pin_id), None) or next(
        (p for p in pins if p.name.lower() == name.lower()), None
    )
    return (placement, pin) if pin else None


def list_revisions(design: Design) -> list[RevisionOut]:
    return [
        RevisionOut(
            id=r.id,
            created_at=r.created_at,
            author=r.author,
            summary=r.summary,
            part_count=len(r.snapshot.get("placements", [])),
            wire_count=len(r.snapshot.get("wires", [])),
        )
        for r in design.revisions
    ]


def restore_revision(session: Session, design: Design, revision_id: int) -> None:
    revision = next((r for r in design.revisions if r.id == revision_id), None)
    if revision is None:
        raise NotFoundError(f"Revision {revision_id} is not in this design")
    snapshot = Snapshot.model_validate(revision.snapshot)
    save_revision(session, design, Author.USER, "Before restoring an earlier version")
    apply_snapshot(session, design, snapshot)
