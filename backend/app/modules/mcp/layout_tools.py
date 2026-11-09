"""Claude's protoboard layout tools (build step 18).

The same service functions as the board canvas, so every rule applies. Positions are
the board's labels (`C14`, and `C9-10` for a cut between two holes). Every change
saves a layout revision first, with a summary of it, so the user can undo it from
History. Layouts themselves aren't deleted here.
"""

from collections.abc import Callable

from pydantic import BaseModel

from app.core.errors import ConflictError, NotFoundError
from app.modules.checks.schemas import CheckSummary, Severity
from app.modules.designs import service as designs
from app.modules.designs.models import WireColor
from app.modules.designs.schemas import PinRef, Rotation
from app.modules.layouts import board as boards
from app.modules.layouts import checks as layout_checks
from app.modules.layouts import picture
from app.modules.layouts import revisions as layout_revisions
from app.modules.layouts import service as layouts
from app.modules.layouts.models import (
    BoardType,
    ConnectorType,
    JumperSide,
    Layout,
    Mount,
)
from app.modules.layouts.schemas import (
    BuildSheetOut,
    ConnectorIn,
    ConnectorUpdate,
    JumperIn,
    LayoutCreate,
    LayoutRevisionOut,
    LayoutStats,
    PartPlace,
)
from app.modules.parts.models import Author

# --- What Claude sees ---


class BoardPartView(BaseModel):
    ref: str
    part: str
    on_board: bool
    # The footprint's origin (usually pin 1), e.g. C5; null off the board.
    at: str | None
    rotation: int
    mount: Mount
    # Each pin's hole, by pin name.
    pins: dict[str, str]


class NotPlacedView(BaseModel):
    ref: str
    part: str
    # Only a part with a footprint for every pin can go on the board.
    has_footprint: bool


class JumperView(BaseModel):
    a: str
    b: str
    side: JumperSide
    insulated: bool
    color: WireColor
    length: float


class ConnectorView(BaseModel):
    ref: str
    type: ConnectorType
    at: str | None
    rotation: int
    # What each pin carries, pin 1 first: `ref.PIN` or null.
    pins: list[str | None]


class CheckView(BaseModel):
    id: str
    severity: Severity
    message: str
    holes: list[str] = []


class LayoutCheckView(BaseModel):
    check_summary: CheckSummary
    stats: LayoutStats
    checks: list[CheckView]
    # Connections the design needs that the board doesn't make yet.
    missing: list[str]


class LayoutView(LayoutCheckView):
    id: int
    design_id: int
    name: str
    board_type: BoardType
    strips: int
    holes: int
    pitch_mm: float
    # The board as text: see the legend at its end.
    picture: str
    parts: list[BoardPartView]
    not_placed: list[NotPlacedView]
    cuts: list[str]
    jumpers: list[JumperView]
    connectors: list[ConnectorView]


class LayoutListItem(BaseModel):
    id: int
    name: str
    board_type: BoardType
    strips: int
    holes: int
    pitch_mm: float
    check_summary: CheckSummary
    stats: LayoutStats


class Layouts(BaseModel):
    layouts: list[LayoutListItem]


class ConnectorProposal(BaseModel):
    for_part: str
    type: ConnectorType
    pins: list[str]
    why: str


class ConnectorProposals(BaseModel):
    connectors: list[ConnectorProposal]


class LayoutRevisions(BaseModel):
    revisions: list[LayoutRevisionOut]


# --- What Claude sends ---


class BoardPlacement(BaseModel):
    """A part on the board (its footprint's origin, usually pin 1, at a hole) or off it."""

    ref: str
    at: str | None = None
    rotation: Rotation | None = None
    mount: Mount | None = None
    off_board: bool = False


class JumperAdd(BaseModel):
    a: str
    b: str
    side: JumperSide = JumperSide.TOP
    insulated: bool = False
    color: WireColor | None = None


class ConnectorAdd(BaseModel):
    """pins: what each carries, pin 1 first (`bme.SDA`, or null). pin_count defaults to
    the pins given."""

    pins: list[PinRef | None]
    type: ConnectorType = ConnectorType.HEADER_FEMALE
    at: str | None = None
    rotation: Rotation = 0
    pin_count: int | None = None
    ref: str | None = None


def _check_view(board: boards.Board) -> LayoutCheckView:
    checked = layout_checks.check(board)
    counts = CheckSummary()
    for r in checked.results:
        setattr(counts, r.severity.value, getattr(counts, r.severity.value) + 1)
    s = checked.summary
    return LayoutCheckView(
        check_summary=counts,
        stats=LayoutStats(
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
        checks=[
            CheckView(id=r.id, severity=r.severity, message=r.message, holes=r.holes)
            for r in checked.results
        ],
        missing=[
            f"{link.net}: {link.a} ({boards.label(link.a_hole)}) to "
            f"{link.b} ({boards.label(link.b_hole)})"
            for link in checked.links
        ],
    )


def layout_view(layout: Layout) -> LayoutView:
    board = boards.build(layout)
    placed = {p.layout_part.id: p for p in board.parts}
    pitch = layout.pitch_mm
    return LayoutView(
        **_check_view(board).model_dump(),
        id=layout.id,
        design_id=layout.design_id,
        name=layout.name,
        board_type=layout.board_type,
        strips=layout.strips,
        holes=layout.holes,
        pitch_mm=pitch,
        picture=picture.render(board),
        parts=[
            BoardPartView(
                ref=lp.placement.ref,
                part=lp.placement.part.name,
                on_board=lp.on_board,
                at=boards.label((lp.strip, lp.hole)) if lp.on_board and lp.strip else None,
                rotation=lp.rotation,
                mount=lp.mount,
                pins={
                    pin.pin.name: boards.label(pin.cell)
                    for pin in (placed[lp.id].pins if lp.id in placed else [])
                },
            )
            for lp in layout.parts
        ],
        not_placed=[
            NotPlacedView(ref=p.ref, part=p.part.name, has_footprint=layouts._has_footprint(p))
            for p in sorted(board.not_placed, key=lambda p: p.ref)
        ],
        cuts=[layouts.cut_label(c) for c in layout.cuts],
        jumpers=[
            JumperView(
                a=boards.label((j.a_strip, j.a_hole)),
                b=boards.label((j.b_strip, j.b_hole)),
                side=j.side,
                insulated=j.insulated,
                color=j.color,
                length=round(boards.jumper_length(j), 1),
            )
            for j in layout.jumpers
        ],
        connectors=[
            ConnectorView(
                ref=c.ref,
                type=c.type,
                at=boards.label((c.strip, c.hole)) if c.strip is not None else None,
                rotation=c.rotation,
                pins=[
                    f"{p.placement.ref}.{p.pin.name}"
                    if (p := next((x for x in c.pins if x.index == i), None))
                    and p.placement
                    and p.pin
                    else None
                    for i in range(1, c.pin_count + 1)
                ],
            )
            for c in layout.connectors
        ],
    )


def _hole(text: str) -> tuple[int, int]:
    try:
        return boards.parse_label(text)
    except ValueError as e:
        raise ConflictError(str(e)) from e


def _listed(items: list[str], limit: int = 4) -> str:
    shown = ", ".join(items[:limit])
    return shown if len(items) <= limit else f"{shown} and {len(items) - limit} more"


def register_layout_tools(tool: Callable, open_session: Callable, READ, WRITE, REMOVE) -> None:
    @tool(READ)
    def list_layouts(design_id: int) -> Layouts:
        """The design's protoboard layouts, each with its check counts and stats."""
        with open_session() as session:
            return Layouts(
                layouts=[
                    LayoutListItem(
                        **{
                            k: v
                            for k, v in layouts.summary(layout).model_dump().items()
                            if k in LayoutListItem.model_fields
                        }
                    )
                    for layout in layouts.list_layouts(session, design_id)
                ]
            )

    @tool(WRITE)
    def create_layout(
        design_id: int,
        name: str,
        board_type: BoardType = BoardType.STRIPBOARD,
        strips: int | None = None,
        holes: int | None = None,
        pitch_mm: float | None = None,
    ) -> LayoutView:
        """A new protoboard layout of the design. A stripboard is 24 strips of 37 holes
        unless sized (ask the user the size of theirs); a breadboard pattern is 14 rows
        of 62. pitch_mm is the hole spacing, 2.54 unless the user's board differs."""
        data = LayoutCreate(
            name=name, board_type=board_type, strips=strips, holes=holes, pitch_mm=pitch_mm
        )
        with open_session() as session:
            return layout_view(layouts.create_layout(session, design_id, data))

    @tool(READ)
    def get_layout(layout_id: int) -> LayoutView:
        """Everything on the board: a text picture (read its legend), each part's pins by
        hole, cuts, jumpers, connectors, parts not placed yet, the checks, the
        connections still missing, and stats (jumpers, their length, cuts, area)."""
        with open_session() as session:
            return layout_view(layouts.get_layout(session, layout_id))

    @tool(READ)
    def check_layout(layout_id: int) -> LayoutCheckView:
        """The layout's checks, the connections still missing, and its stats: lighter
        than get_layout, for checking after each change."""
        with open_session() as session:
            return _check_view(boards.build(layouts.get_layout(session, layout_id)))

    @tool(WRITE)
    def place_on_board(layout_id: int, parts: list[BoardPlacement]) -> LayoutView:
        """Puts design parts on the board, moves them, or marks them off the board (on a
        cable, needing a connector). at is the hole for the footprint's origin, usually
        pin 1 (e.g. "C5"). rotation turns it clockwise; left out, a part keeps its
        rotation. mount: socketed (raised in headers: the default for boards) or
        soldered (the default for other parts: holes under it are blocked)."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            items, said = [], []
            for p in parts:
                placement = designs.placement_by_ref(layout.design, p.ref)
                if p.off_board:
                    items.append(PartPlace(placement_id=placement.id, on_board=False))
                    said.append(f"{placement.ref} off the board")
                    continue
                if not p.at:
                    raise ConflictError(f"Say where {p.ref} goes (at), or set off_board")
                strip, hole = _hole(p.at)
                items.append(
                    PartPlace(
                        placement_id=placement.id,
                        strip=strip,
                        hole=hole,
                        rotation=p.rotation,
                        mount=p.mount,
                    )
                )
                said.append(f"{placement.ref} at {boards.label((strip, hole))}")
            summary = f"Placed {_listed(said)}"
            return layout_view(layouts.place_parts(session, layout_id, items, claude=summary))

    @tool(WRITE)
    def cut(layout_id: int, at: list[str]) -> LayoutView:
        """Cuts stripboard copper: "B4" at a hole (removing its copper), "C9-10" between
        two neighbouring holes. Never at a hole with a leg in it."""
        with open_session() as session:
            cuts = [layouts.parse_cut(text) for text in at]
            summary = f"Cut {_listed([layouts.cut_label(c) for c in cuts])}"
            return layout_view(layouts.add_cuts(session, layout_id, cuts, claude=summary))

    @tool(REMOVE)
    def uncut(layout_id: int, at: list[str]) -> LayoutView:
        """Removes cuts, written as for cut. A revision is saved first."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            existing = {layouts.cut_label(c): c.id for c in layout.cuts}
            wanted = [layouts.cut_label(layouts.parse_cut(text)) for text in at]
            if missing := [w for w in wanted if w not in existing]:
                raise NotFoundError(f"There's no cut at {missing[0]}")
            summary = f"Removed the cuts at {_listed(wanted)}"
            return layout_view(
                layouts.remove_cuts(
                    session, layout_id, [existing[w] for w in wanted], claude=summary
                )
            )

    @tool(WRITE)
    def add_jumpers(layout_id: int, jumpers: list[JumperAdd]) -> LayoutView:
        """Wire links between holes. side top: insulated wire on the component side,
        through two free holes. side bottom: on the copper; a bare one joins every strip
        it lies across (insulated: only its ends). Keep them straight along or across
        the strips."""
        with open_session() as session:
            items = []
            for j in jumpers:
                a, b = _hole(j.a), _hole(j.b)
                items.append(
                    JumperIn(
                        a_strip=a[0],
                        a_hole=a[1],
                        b_strip=b[0],
                        b_hole=b[1],
                        side=j.side,
                        insulated=j.insulated,
                        color=j.color,
                    )
                )
            summary = (
                "Added jumper"
                + ("s " if len(jumpers) > 1 else " ")
                + _listed([f"{j.a}→{j.b}" for j in jumpers])
            )
            return layout_view(layouts.add_jumpers(session, layout_id, items, claude=summary))

    @tool(REMOVE)
    def remove_jumper(layout_id: int, a: str, b: str) -> LayoutView:
        """Removes the jumper between two holes (either way round)."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            ends = {_hole(a), _hole(b)}
            jumper = next(
                (
                    j
                    for j in layout.jumpers
                    if {(j.a_strip, j.a_hole), (j.b_strip, j.b_hole)} == ends
                ),
                None,
            )
            if jumper is None:
                raise NotFoundError(f"There's no jumper between {a} and {b}")
            return layout_view(
                layouts.remove_jumper(
                    session, layout_id, jumper.id, claude=f"Removed the jumper {a}→{b}"
                )
            )

    @tool(READ)
    def propose_connectors(layout_id: int) -> ConnectorProposals:
        """A connector for each off-board part whose connections reach the board: its
        pins in the part's own order, so the cable runs straight, and a type that suits.
        Nothing is changed: add the ones the user agrees to with add_connectors."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            return ConnectorProposals(
                connectors=[ConnectorProposal(**p) for p in layouts.propose_connectors(layout)]
            )

    @tool(WRITE)
    def add_connectors(layout_id: int, connectors: list[ConnectorAdd]) -> LayoutView:
        """Generic connectors for off-board parts, named J1, J2… unless given a ref. at is
        pin 1's hole; the rest follow along the strip (rotation 90: down across the
        strips, usually what you want so each pin is on its own strip). Types:
        header_female (default), header_male, jst_xh, screw_508 (two holes a pin)."""
        with open_session() as session:
            layout = None
            for n, c in enumerate(connectors):
                strip, hole = _hole(c.at) if c.at else (None, None)
                data = ConnectorIn(
                    type=c.type,
                    pin_count=c.pin_count or max(len(c.pins), 1),
                    ref=c.ref,
                    strip=strip,
                    hole=hole,
                    rotation=c.rotation,
                    pins=c.pins,
                )
                # One revision for the whole call: before the first connector.
                summary = (
                    "Added connectors for "
                    + _listed(sorted({p.split(".")[0] for x in connectors for p in x.pins if p}))
                    if n == 0
                    else None
                )
                layout = layouts.add_connector(session, layout_id, data, claude=summary)
            if layout is None:
                layout = layouts.get_layout(session, layout_id)
            return layout_view(layout)

    @tool(WRITE)
    def update_connector(
        layout_id: int,
        ref: str,
        at: str | None = None,
        rotation: Rotation | None = None,
        type: ConnectorType | None = None,
        pin_count: int | None = None,
        pins: list[PinRef | None] | None = None,
    ) -> LayoutView:
        """Moves, turns, retypes or reassigns a connector, found by its ref. pins, when
        given, is the whole list, pin 1 first."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            connector = next((c for c in layout.connectors if c.ref.lower() == ref.lower()), None)
            if connector is None:
                raise NotFoundError(f"There's no connector {ref}")
            fields: dict = {}
            if at is not None:
                fields["strip"], fields["hole"] = _hole(at)
            for name, value in (
                ("rotation", rotation),
                ("type", type),
                ("pin_count", pin_count),
                ("pins", pins),
            ):
                if value is not None:
                    fields[name] = value
            return layout_view(
                layouts.update_connector(
                    session,
                    layout_id,
                    connector.id,
                    ConnectorUpdate(**fields),
                    claude=f"Changed {connector.ref}",
                )
            )

    @tool(REMOVE)
    def remove_connector(layout_id: int, ref: str) -> LayoutView:
        """Removes a connector from the layout."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            connector = next((c for c in layout.connectors if c.ref.lower() == ref.lower()), None)
            if connector is None:
                raise NotFoundError(f"There's no connector {ref}")
            return layout_view(
                layouts.remove_connector(
                    session, layout_id, connector.id, claude=f"Removed {connector.ref}"
                )
            )

    @tool(WRITE)
    def cut_between_rows(layout_id: int, ref: str) -> LayoutView:
        """Cuts every strip a part spans between its pins that mustn't be joined, such as
        a module's two header rows on shared strips: at a free hole midway, or between
        holes when none is free."""
        with open_session() as session:
            layout = layouts.get_layout(session, layout_id)
            placement = designs.placement_by_ref(layout.design, ref)
            return layout_view(
                layouts.cut_between_rows(
                    session,
                    layout_id,
                    placement.id,
                    claude=f"Cut the strips between {placement.ref}'s rows",
                )
            )

    @tool(WRITE)
    def trim_dead_copper(layout_id: int) -> LayoutView:
        """Cuts each strip just past its outermost connection, between holes. Optional
        tidying; offer it rather than doing it unasked."""
        with open_session() as session:
            return layout_view(
                layouts.trim_dead_copper(session, layout_id, claude="Trimmed dead copper")
            )

    @tool(READ)
    def get_build_sheet(layout_id: int) -> BuildSheetOut:
        """The build sheet: the order of work, the cuts (strip by strip as seen from the
        copper side), jumpers with the wire length to cut, parts with pin 1's hole,
        connectors and their cables, and what to have ready. `text` is the same as
        Markdown with tick boxes: walk the user through it, or save it next to the
        firmware. errors and missing above 0 mean the layout isn't finished."""
        with open_session() as session:
            return layouts.build_sheet(layouts.get_layout(session, layout_id))

    @tool(READ)
    def list_layout_revisions(layout_id: int) -> LayoutRevisions:
        """Saved versions of the layout, newest first: each is the board as it was before
        the change in its summary."""
        with open_session() as session:
            return LayoutRevisions(
                revisions=layout_revisions.list_revisions(layouts.get_layout(session, layout_id))
            )

    @tool(WRITE)
    def restore_layout_revision(layout_id: int, revision_id: int) -> LayoutView:
        """Puts the board back as it was in a revision. The current board is saved
        first, so this can be undone too."""
        with open_session() as session:
            return layout_view(
                layouts.restore_revision(session, layout_id, revision_id, Author.CLAUDE)
            )
