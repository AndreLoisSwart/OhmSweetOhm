"""Layouts: creating them, placing parts, cuts, jumpers and connectors. Business rules
live here; every change answers with the whole layout, checks included."""

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError
from app.modules.checks.schemas import CheckSummary
from app.modules.designs import service as designs
from app.modules.designs.models import Placement, WireColor
from app.modules.layouts import board as boards
from app.modules.layouts import checks, revisions
from app.modules.layouts.board import connector_cells, footprint_sig, label
from app.modules.layouts.models import (
    BoardType,
    Connector,
    ConnectorPin,
    Cut,
    Jumper,
    JumperSide,
    Layout,
    LayoutPart,
    Mount,
)
from app.modules.layouts.schemas import (
    DEFAULT_SIZE,
    BoardPinOut,
    BodyOut,
    ConnectorIn,
    ConnectorOut,
    ConnectorPinOut,
    ConnectorUpdate,
    CutIn,
    CutOut,
    JumperIn,
    JumperOut,
    JumperUpdate,
    LayoutCheck,
    LayoutCreate,
    LayoutDetail,
    LayoutSnapshot,
    LayoutStats,
    LayoutSummary,
    LayoutUpdate,
    LinkOut,
    PartPlace,
    PlacedRef,
    SegmentOut,
    UnplacedOut,
)
from app.modules.parts.models import Author, PartKind, PinKind

DEFAULT_JUMPER_COLOR = {JumperSide.TOP: WireColor.BLUE, JumperSide.BOTTOM: WireColor.GRAY}


# Reading -------------------------------------------------------------------------------


def get_layout(session: Session, layout_id: int) -> Layout:
    layout = session.get(Layout, layout_id)
    if layout is None:
        raise NotFoundError(f"Layout {layout_id} not found")
    return layout


def list_layouts(session: Session, design_id: int) -> list[Layout]:
    designs.get_design(session, design_id)
    return list(
        session.scalars(select(Layout).where(Layout.design_id == design_id).order_by(Layout.id))
    )


def _summary_fields(layout: Layout, checked: checks.Checked) -> dict:
    counts = CheckSummary()
    for result in checked.results:
        setattr(counts, result.severity.value, getattr(counts, result.severity.value) + 1)
    s = checked.summary
    return {
        "id": layout.id,
        "design_id": layout.design_id,
        "name": layout.name,
        "board_type": layout.board_type,
        "strips": layout.strips,
        "holes": layout.holes,
        "updated_at": layout.updated_at,
        "check_summary": counts,
        "stats": LayoutStats(
            on_board=s.on_board,
            off_board=s.off_board,
            not_placed=s.not_placed,
            missing=s.missing,
            cuts=s.cuts,
            jumpers=s.jumpers,
            jumper_length=s.jumper_length,
            area_strips=s.area_strips,
            area_holes=s.area_holes,
        ),
        "placed": [
            PlacedRef(
                placement_id=lp.placement_id,
                on_board=lp.on_board,
                at=label((lp.strip, lp.hole)) if lp.on_board and lp.strip and lp.hole else None,
            )
            for lp in layout.parts
        ],
    }


def summary(layout: Layout) -> LayoutSummary:
    return LayoutSummary(**_summary_fields(layout, checks.check(boards.build(layout))))


def _has_footprint(placement: Placement) -> bool:
    return all(p.x_mm is not None for p in placement.part.pins if p.kind != PinKind.NC) and bool(
        placement.part.pins
    )


def detail(layout: Layout) -> LayoutDetail:
    board = boards.build(layout)
    checked = checks.check(board)
    placed = {part.layout_part.id: part for part in board.parts}
    parts = []
    for lp in layout.parts:
        on = placed.get(lp.id)
        parts.append(
            {
                "placement_id": lp.placement_id,
                "ref": lp.placement.ref,
                "part_id": lp.placement.part_id,
                "part_name": lp.placement.part.name,
                "on_board": lp.on_board,
                "strip": lp.strip,
                "hole": lp.hole,
                "at": label((lp.strip, lp.hole)) if lp.strip and lp.hole else None,
                "rotation": lp.rotation,
                "mount": lp.mount,
                "footprint_sig": lp.footprint_sig,
                "pins": [
                    BoardPinOut(key=p.key, strip=p.cell[0], hole=p.cell[1], at=label(p.cell))
                    for p in (on.pins if on else [])
                ],
                "body": BodyOut(
                    strip0=on.body[0], hole0=on.body[1], strip1=on.body[2], hole1=on.body[3]
                )
                if on and on.body
                else None,
            }
        )
    connectors = []
    for c in layout.connectors:
        cells = connector_cells(c)
        assigned = {p.index: p for p in c.pins}
        connectors.append(
            ConnectorOut(
                id=c.id,
                ref=c.ref,
                type=c.type,
                pin_count=c.pin_count,
                strip=c.strip,
                hole=c.hole,
                at=label((c.strip, c.hole)) if c.strip is not None and c.hole is not None else None,
                rotation=c.rotation,
                pins=[
                    ConnectorPinOut(
                        index=i,
                        pin=f"{p.placement.ref}.{p.pin.name}"
                        if (p := assigned.get(i)) and p.placement and p.pin
                        else None,
                        placement_id=p.placement_id if (p := assigned.get(i)) else None,
                        pin_id=p.pin_id if (p := assigned.get(i)) else None,
                        strip=cells[i - 1][0] if cells else None,
                        hole=cells[i - 1][1] if cells else None,
                    )
                    for i in range(1, c.pin_count + 1)
                ],
            )
        )
    return LayoutDetail(
        **_summary_fields(layout, checked),
        notes=layout.notes,
        created_at=layout.created_at,
        parts=parts,
        not_placed=[
            UnplacedOut(
                placement_id=p.id,
                ref=p.ref,
                part_id=p.part_id,
                part_name=p.part.name,
                has_footprint=_has_footprint(p),
            )
            for p in sorted(board.not_placed, key=lambda p: p.ref)
        ],
        cuts=[
            CutOut(
                id=c.id, strip=c.strip, hole=c.hole, between=c.between, at=label((c.strip, c.hole))
            )
            for c in layout.cuts
        ],
        jumpers=[
            JumperOut(
                id=j.id,
                a_strip=j.a_strip,
                a_hole=j.a_hole,
                b_strip=j.b_strip,
                b_hole=j.b_hole,
                a=label((j.a_strip, j.a_hole)),
                b=label((j.b_strip, j.b_hole)),
                side=j.side,
                insulated=j.insulated,
                color=j.color,
                length=round(boards.jumper_length(j), 1),
            )
            for j in layout.jumpers
        ],
        connectors=connectors,
        segments=[
            SegmentOut(
                a_strip=s.a[0],
                a_hole=s.a[1],
                b_strip=s.b[0],
                b_hole=s.b[1],
                nets=s.nets,
                short=s.short,
            )
            for s in board.segments
        ],
        links=[
            LinkOut(
                net=link.net,
                a=link.a,
                b=link.b,
                a_strip=link.a_hole[0],
                a_hole=link.a_hole[1],
                b_strip=link.b_hole[0],
                b_hole=link.b_hole[1],
            )
            for link in checked.links
        ],
        checks=[
            LayoutCheck(
                id=r.id,
                severity=r.severity,
                message=r.message,
                pins=r.pins,
                holes=r.holes,
                net=r.net,
            )
            for r in checked.results
        ],
    )


# The layout itself ---------------------------------------------------------------------


def create_layout(session: Session, design_id: int, data: LayoutCreate) -> Layout:
    design = designs.get_design(session, design_id)
    strips, holes = DEFAULT_SIZE[data.board_type]
    if data.board_type == BoardType.BREADBOARD:
        if data.strips not in (None, boards.BREADBOARD_STRIPS):
            raise ConflictError(
                f"A breadboard pattern has {boards.BREADBOARD_STRIPS} rows: rails, two blocks "
                "of five and rails"
            )
    else:
        strips = data.strips or strips
    layout = Layout(
        design=design,
        name=data.name,
        board_type=data.board_type,
        strips=strips,
        holes=data.holes or holes,
    )
    session.add(layout)
    session.commit()
    return layout


def _touch(layout: Layout) -> None:
    layout.updated_at = utcnow()


def update_layout(session: Session, layout_id: int, data: LayoutUpdate) -> Layout:
    layout = get_layout(session, layout_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(layout, field, value)
    _touch(layout)
    session.commit()
    return layout


def delete_layout(session: Session, layout_id: int) -> None:
    session.delete(get_layout(session, layout_id))
    session.commit()


# Parts ---------------------------------------------------------------------------------


def _placement(layout: Layout, placement_id: int) -> Placement:
    for placement in layout.design.placements:
        if placement.id == placement_id:
            return placement
    raise NotFoundError(f"Placement {placement_id} is not in this layout's design")


def place_parts(
    session: Session, layout_id: int, items: list[PartPlace], claude: str | None = None
) -> Layout:
    """Puts parts on the board, moves them, or takes them off it (on_board false).
    Placing or moving a part records its footprint as confirmed."""
    layout = get_layout(session, layout_id)
    revisions.before_change(layout, claude)
    existing = {lp.placement_id: lp for lp in layout.parts}
    for item in items:
        placement = _placement(layout, item.placement_id)
        lp = existing.get(placement.id)
        if lp is None:
            is_board = placement.part.kind == PartKind.BOARD
            lp = LayoutPart(
                placement=placement,
                rotation=0,
                mount=Mount.SOCKETED if is_board else Mount.SOLDERED,
            )
            layout.parts.append(lp)
            existing[placement.id] = lp
        if item.on_board and not _has_footprint(placement):
            raise ConflictError(
                f"{placement.ref} ({placement.part.name}) has no footprint for every pin yet: "
                "give it one on its part page, or keep it off the board"
            )
        lp.on_board = item.on_board
        lp.strip, lp.hole = (item.strip, item.hole) if item.on_board else (None, None)
        if item.rotation is not None:
            lp.rotation = item.rotation
        if item.mount is not None:
            lp.mount = item.mount
        if item.on_board:
            lp.footprint_sig = footprint_sig(placement.part)
    _touch(layout)
    session.commit()
    return layout


def unplace_part(
    session: Session, layout_id: int, placement_id: int, claude: str | None = None
) -> Layout:
    """Back to not placed: neither on the board nor off it."""
    layout = get_layout(session, layout_id)
    lp = next((p for p in layout.parts if p.placement_id == placement_id), None)
    if lp is None:
        raise NotFoundError(f"Placement {placement_id} isn't in this layout")
    revisions.before_change(layout, claude)
    layout.parts.remove(lp)
    _touch(layout)
    session.commit()
    return layout


# Cuts ----------------------------------------------------------------------------------


def _inside(layout: Layout, strip: int, hole: int) -> bool:
    return 1 <= strip <= layout.strips and 1 <= hole <= layout.holes


def add_cuts(
    session: Session, layout_id: int, items: list[CutIn], claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    if layout.board_type != BoardType.STRIPBOARD:
        raise ConflictError("Only a stripboard's copper can be cut")
    have = {(c.strip, c.hole, c.between) for c in layout.cuts}
    for item in items:
        if not _inside(layout, item.strip, item.hole) or (
            item.between and item.hole >= layout.holes
        ):
            where = label((item.strip, item.hole))
            raise ConflictError(
                f"{where} isn't on the board" + (" (or is its last hole)" if item.between else "")
            )
        if (item.strip, item.hole, item.between) in have:
            where = label((item.strip, item.hole))
            raise ConflictError(
                f"{where} is already cut{' there' if not item.between else ' after it'}"
            )
        have.add((item.strip, item.hole, item.between))
    revisions.before_change(layout, claude)
    layout.cuts.extend(Cut(**item.model_dump()) for item in items)
    _touch(layout)
    session.commit()
    return layout


def remove_cut(session: Session, layout_id: int, cut_id: int, claude: str | None = None) -> Layout:
    layout = get_layout(session, layout_id)
    cut = next((c for c in layout.cuts if c.id == cut_id), None)
    if cut is None:
        raise NotFoundError(f"Cut {cut_id} isn't in this layout")
    revisions.before_change(layout, claude)
    layout.cuts.remove(cut)
    _touch(layout)
    session.commit()
    return layout


# Jumpers -------------------------------------------------------------------------------


def _check_jumper(layout: Layout, a: tuple[int, int], b: tuple[int, int]) -> None:
    if a == b:
        raise ConflictError("A jumper needs two different holes")
    for cell in (a, b):
        if not _inside(layout, *cell):
            raise ConflictError(f"{label(cell)} isn't on the board")


def add_jumpers(
    session: Session, layout_id: int, items: list[JumperIn], claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    for item in items:
        _check_jumper(layout, (item.a_strip, item.a_hole), (item.b_strip, item.b_hole))
    revisions.before_change(layout, claude)
    for item in items:
        fields = item.model_dump()
        fields["color"] = item.color or DEFAULT_JUMPER_COLOR[item.side]
        layout.jumpers.append(Jumper(**fields))
    _touch(layout)
    session.commit()
    return layout


def _jumper(layout: Layout, jumper_id: int) -> Jumper:
    jumper = next((j for j in layout.jumpers if j.id == jumper_id), None)
    if jumper is None:
        raise NotFoundError(f"Jumper {jumper_id} isn't in this layout")
    return jumper


def update_jumper(
    session: Session, layout_id: int, jumper_id: int, data: JumperUpdate, claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    jumper = _jumper(layout, jumper_id)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    a = (changes.get("a_strip", jumper.a_strip), changes.get("a_hole", jumper.a_hole))
    b = (changes.get("b_strip", jumper.b_strip), changes.get("b_hole", jumper.b_hole))
    _check_jumper(layout, a, b)
    revisions.before_change(layout, claude)
    for field, value in changes.items():
        setattr(jumper, field, value)
    _touch(layout)
    session.commit()
    return layout


def remove_jumper(
    session: Session, layout_id: int, jumper_id: int, claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    jumper = _jumper(layout, jumper_id)
    revisions.before_change(layout, claude)
    layout.jumpers.remove(jumper)
    _touch(layout)
    session.commit()
    return layout


# Connectors ----------------------------------------------------------------------------


def _free_ref(layout: Layout) -> str:
    taken = {c.ref.lower() for c in layout.connectors}
    n = 1
    while f"j{n}" in taken:
        n += 1
    return f"J{n}"


def _assign(layout: Layout, connector: Connector, pins: list[str | None]) -> None:
    """Sets what each connector pin carries; refuses a pin already on another one."""
    if len(pins) > connector.pin_count:
        raise ConflictError(f"{connector.ref} has {connector.pin_count} pins, not {len(pins)}")
    elsewhere = {
        (p.placement_id, p.pin_id): c.ref
        for c in layout.connectors
        if c is not connector
        for p in c.pins
        if p.placement_id is not None
    }
    resolved = []
    seen = set()
    for i, ref in enumerate(pins, start=1):
        if ref is None:
            resolved.append((i, None, None))
            continue
        placement, pin = designs.resolve_pin(layout.design, ref)
        key = (placement.id, pin.id)
        if key in elsewhere:
            raise ConflictError(f"{ref} is already on {elsewhere[key]}")
        if key in seen:
            raise ConflictError(f"{ref} is given two pins of {connector.ref}")
        seen.add(key)
        resolved.append((i, placement, pin))
    connector.pins.clear()
    # Delete the old rows before inserting their replacements (same indexes).
    if (session := object_session(connector)) is not None:
        session.flush()
    for i, placement, pin in resolved:
        connector.pins.append(ConnectorPin(index=i, placement=placement, pin=pin))


def add_connector(
    session: Session, layout_id: int, data: ConnectorIn, claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    ref = data.ref or _free_ref(layout)
    if any(c.ref.lower() == ref.lower() for c in layout.connectors):
        raise ConflictError(f"There's already a {ref}")
    if (data.strip is None) != (data.hole is None):
        raise ConflictError("A connector on the board needs both a strip and a hole")
    revisions.before_change(layout, claude)
    connector = Connector(
        ref=ref,
        type=data.type,
        pin_count=data.pin_count,
        strip=data.strip,
        hole=data.hole,
        rotation=data.rotation,
    )
    layout.connectors.append(connector)
    _assign(layout, connector, data.pins)
    _touch(layout)
    session.commit()
    return layout


def _connector(layout: Layout, connector_id: int) -> Connector:
    connector = next((c for c in layout.connectors if c.id == connector_id), None)
    if connector is None:
        raise NotFoundError(f"Connector {connector_id} isn't in this layout")
    return connector


def update_connector(
    session: Session,
    layout_id: int,
    connector_id: int,
    data: ConnectorUpdate,
    claude: str | None = None,
) -> Layout:
    layout = get_layout(session, layout_id)
    connector = _connector(layout, connector_id)
    changes = data.model_dump(exclude_unset=True)
    if "ref" in changes:
        if changes["ref"] is None:
            raise ConflictError("A connector needs a ref")
        if any(
            c.ref.lower() == changes["ref"].lower() for c in layout.connectors if c is not connector
        ):
            raise ConflictError(f"There's already a {changes['ref']}")
    strip = changes.get("strip", connector.strip)
    hole = changes.get("hole", connector.hole)
    if (strip is None) != (hole is None):
        raise ConflictError("A connector on the board needs both a strip and a hole")
    for field in ("type", "pin_count", "rotation"):
        if field in changes and changes[field] is None:
            raise ConflictError(f"{field} can't be cleared")
    revisions.before_change(layout, claude)
    pins = changes.pop("pins", None)
    for field, value in changes.items():
        setattr(connector, field, value)
    if pins is not None:
        _assign(layout, connector, pins)
    elif "pin_count" in changes:
        # Fewer pins: the ones past the end go.
        current = [
            f"{p.placement.ref}.{p.pin.name}" if p.placement and p.pin else None
            for p in connector.pins
            if p.index <= connector.pin_count
        ]
        _assign(layout, connector, current)
    _touch(layout)
    session.commit()
    return layout


def remove_connector(
    session: Session, layout_id: int, connector_id: int, claude: str | None = None
) -> Layout:
    layout = get_layout(session, layout_id)
    connector = _connector(layout, connector_id)
    revisions.before_change(layout, claude)
    layout.connectors.remove(connector)
    _touch(layout)
    session.commit()
    return layout


# Undo and revisions --------------------------------------------------------------------


def apply_snapshot(session: Session, layout_id: int, snapshot: LayoutSnapshot) -> Layout:
    """Sets the whole layout at once: the canvas's undo and redo."""
    layout = get_layout(session, layout_id)
    revisions.before_change(layout, None)
    revisions.apply_snapshot(session, layout, snapshot)
    session.commit()
    return layout


def restore_revision(
    session: Session, layout_id: int, revision_id: int, author: Author = Author.USER
) -> Layout:
    layout = get_layout(session, layout_id)
    revisions.restore_revision(session, layout, revision_id, author)
    session.commit()
    return layout


# Helpers (step 17) ---------------------------------------------------------------------


def _hole_users(board: boards.Board) -> set[tuple[int, int]]:
    """Holes with a leg, a connector pin or a jumper end in them."""
    used = {pin.cell for part in board.parts for pin in part.pins}
    for connector in board.layout.connectors:
        used.update(connector_cells(connector))
    for j in board.layout.jumpers:
        used.update({(j.a_strip, j.a_hole), (j.b_strip, j.b_hole)})
    return used


def cut_between_rows(
    session: Session, layout_id: int, placement_id: int, claude: str | None = None
) -> Layout:
    """Cuts every strip the part spans between its pins that aren't meant to be joined
    (a module's two header rows share strips): at a free hole midway, or between holes
    when none is free. Strips already split there are left alone."""
    layout = get_layout(session, layout_id)
    if layout.board_type != BoardType.STRIPBOARD:
        raise ConflictError("Only a stripboard's copper can be cut")
    board = boards.build(layout)
    part = next((p for p in board.parts if p.layout_part.placement_id == placement_id), None)
    if part is None:
        raise NotFoundError("That part isn't on this board")
    used = _hole_users(board)
    by_strip: dict[int, list] = {}
    for pin in part.pins:
        by_strip.setdefault(pin.cell[0], []).append(pin)
    cuts: list[CutIn] = []
    for strip, pins in sorted(by_strip.items()):
        pins.sort(key=lambda p: p.cell[1])
        for a, b in zip(pins, pins[1:], strict=False):
            if board.net_of.get(a.key) == board.net_of.get(b.key):
                continue
            h1, h2 = a.cell[1], b.cell[1]
            if any(c[0] == strip and h1 < c[1] < h2 for c in board.cut_holes) or any(
                c[0] == strip and h1 <= c[1] < h2 for c in board.cut_between
            ):
                continue
            free = [h for h in range(h1 + 1, h2) if (strip, h) not in used]
            if free:
                cuts.append(CutIn(strip=strip, hole=free[len(free) // 2]))
            else:
                cuts.append(CutIn(strip=strip, hole=h1, between=True))
    if not cuts:
        raise ConflictError(f"{part.ref}'s strips are already split between its pins")
    return add_cuts(session, layout_id, cuts, claude)


def trim_dead_copper(session: Session, layout_id: int, claude: str | None = None) -> Layout:
    """Cuts each strip just past its outermost connection, between holes, so no copper
    hangs off the end of a connection. Strips with nothing on them are left whole."""
    layout = get_layout(session, layout_id)
    if layout.board_type != BoardType.STRIPBOARD:
        raise ConflictError("Only a stripboard's copper can be cut")
    board = boards.build(layout)
    used = _hole_users(board)
    for j in layout.jumpers:
        if j.side == JumperSide.BOTTOM and not j.insulated:
            used.update(boards.jumper_path(j))
    cuts: list[CutIn] = []
    for seg in board.segments:
        if seg.a[0] != seg.b[0]:
            continue
        strip = seg.a[0]
        holes = sorted(h for s, h in used if s == strip and seg.a[1] <= h <= seg.b[1])
        if not holes:
            continue
        if holes[0] > seg.a[1]:
            cuts.append(CutIn(strip=strip, hole=holes[0] - 1, between=True))
        if holes[-1] < seg.b[1]:
            cuts.append(CutIn(strip=strip, hole=holes[-1], between=True))
    if not cuts:
        raise ConflictError("There's no dead copper to trim")
    return add_cuts(session, layout_id, cuts, claude)
