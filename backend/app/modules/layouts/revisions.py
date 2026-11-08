"""Layout revisions: the layout's parts, cuts, jumpers and connectors saved before a
change, as for designs (designs/revisions.py): one before each of Claude's changes, one
per canvas editing session, and one before a restore. The latest 50 are kept."""

from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import NotFoundError

# Same quiet spell as designs.
from app.modules.designs.revisions import QUIET
from app.modules.layouts.board import footprint_sig
from app.modules.layouts.models import (
    Connector,
    ConnectorPin,
    Cut,
    Jumper,
    Layout,
    LayoutPart,
    LayoutRevision,
)
from app.modules.layouts.schemas import (
    ConnectorPinSnapshot,
    ConnectorSnapshot,
    CutSnapshot,
    JumperSnapshot,
    LayoutRevisionOut,
    LayoutSnapshot,
    PartSnapshot,
)
from app.modules.parts.models import Author

KEEP = 50
SESSION_SUMMARY = "Before editing on the board"


def snapshot_of(layout: Layout) -> LayoutSnapshot:
    return LayoutSnapshot(
        parts=[
            PartSnapshot(
                placement_id=p.placement_id,
                ref=p.placement.ref,
                on_board=p.on_board,
                strip=p.strip,
                hole=p.hole,
                rotation=p.rotation,
                mount=p.mount,
                footprint_sig=p.footprint_sig,
            )
            for p in layout.parts
        ],
        cuts=[CutSnapshot(strip=c.strip, hole=c.hole, between=c.between) for c in layout.cuts],
        jumpers=[
            JumperSnapshot(
                a_strip=j.a_strip,
                a_hole=j.a_hole,
                b_strip=j.b_strip,
                b_hole=j.b_hole,
                side=j.side,
                insulated=j.insulated,
                color=j.color,
            )
            for j in layout.jumpers
        ],
        connectors=[
            ConnectorSnapshot(
                ref=c.ref,
                type=c.type,
                pin_count=c.pin_count,
                strip=c.strip,
                hole=c.hole,
                rotation=c.rotation,
                pins=[
                    ConnectorPinSnapshot(
                        index=p.index, placement_id=p.placement_id, pin_id=p.pin_id
                    )
                    for p in c.pins
                ],
            )
            for c in layout.connectors
        ],
    )


def save_revision(layout: Layout, author: Author, summary: str) -> None:
    """Saves the layout as it is now. The caller commits, along with its change."""
    layout.revisions.insert(
        0,
        LayoutRevision(
            created_at=utcnow(),
            author=author,
            summary=summary[:200],
            snapshot=snapshot_of(layout).model_dump(mode="json"),
        ),
    )
    del layout.revisions[KEEP:]


def before_change(layout: Layout, claude: str | None) -> None:
    """Claude's changes each get a revision; the canvas's one per editing session."""
    if claude is not None:
        save_revision(layout, Author.CLAUDE, claude)
        return
    now = utcnow()
    latest = layout.revisions[0].created_at if layout.revisions else None
    if now - layout.updated_at < QUIET or (latest and now - latest < QUIET):
        return
    save_revision(layout, Author.USER, SESSION_SUMMARY)


def apply_snapshot(session: Session, layout: Layout, snapshot: LayoutSnapshot) -> None:
    """Makes the layout match the snapshot. Parts and pins no longer in the design are
    left out rather than refused, so an old revision can always be restored."""
    placements = {p.id: p for p in layout.design.placements}
    pins = {pin.id for p in placements.values() for pin in p.part.pins}
    layout.parts.clear()
    layout.cuts.clear()
    layout.jumpers.clear()
    layout.connectors.clear()
    session.flush()
    for item in snapshot.parts:
        if item.placement_id in placements:
            layout.parts.append(
                LayoutPart(
                    placement=placements[item.placement_id],
                    on_board=item.on_board,
                    strip=item.strip,
                    hole=item.hole,
                    rotation=item.rotation,
                    mount=item.mount,
                    # A snapshot without one confirms the footprint as it is now.
                    footprint_sig=item.footprint_sig
                    or footprint_sig(placements[item.placement_id].part),
                )
            )
    layout.cuts.extend(Cut(**c.model_dump()) for c in snapshot.cuts)
    layout.jumpers.extend(Jumper(**j.model_dump()) for j in snapshot.jumpers)
    for item in snapshot.connectors:
        connector = Connector(**item.model_dump(exclude={"pins"}))
        for pin in item.pins:
            ok = pin.placement_id in placements and pin.pin_id in pins
            connector.pins.append(
                ConnectorPin(
                    index=pin.index,
                    placement_id=pin.placement_id if ok else None,
                    pin_id=pin.pin_id if ok else None,
                )
            )
        layout.connectors.append(connector)
    layout.updated_at = utcnow()


def list_revisions(layout: Layout) -> list[LayoutRevisionOut]:
    return [
        LayoutRevisionOut(id=r.id, created_at=r.created_at, author=r.author, summary=r.summary)
        for r in layout.revisions
    ]


def restore_revision(
    session: Session, layout: Layout, revision_id: int, author: Author = Author.USER
) -> None:
    revision = next((r for r in layout.revisions if r.id == revision_id), None)
    if revision is None:
        raise NotFoundError(f"Revision {revision_id} is not in this layout")
    snapshot = LayoutSnapshot.model_validate(revision.snapshot)
    save_revision(layout, author, "Before restoring an earlier version")
    apply_snapshot(session, layout, snapshot)
