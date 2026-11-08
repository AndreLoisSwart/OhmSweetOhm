"""The physical board (build step 15): where things sit, and what the copper joins.

Geometry: a part's footprint is in mm from its origin (top view, x right, y down). On
the board, x runs along the strips (hole numbers) and y across them (strip letters), at
2.54 mm a step; a rotation turns the footprint clockwise about its origin first.

Connectivity is union-find over nodes: each hole is a node (its solder joint), copper
joins neighbouring holes (stripboard: along a strip, unless cut; breadboard: its fixed
groups), jumpers join their ends (a bare bottom link also every hole it lies across),
and each pin joins the hole it's soldered in. Pins of a part joined inside it (its
grounds, a tie) are joined here too, as in the design's nets.
"""

import hashlib
import json
import re
from dataclasses import dataclass, field

from app.modules.designs.models import Design, Placement
from app.modules.designs.nets import compute_nets
from app.modules.layouts.models import (
    BoardType,
    Connector,
    ConnectorType,
    Jumper,
    JumperSide,
    Layout,
    LayoutPart,
)
from app.modules.parts.models import Part, Pin, PinKind

# The usual distance between protoboard holes; a layout sets its own (Layout.pitch_mm).
PITCH_MM = 2.54
# Pitches offered for a new board, and the one a breadboard pattern always has.
PITCHES_MM = (2.54, 2.0, 1.27)
# How far a footprint's hole may be from the grid and still count as on it.
GRID_TOLERANCE_MM = 0.1
# Each connector type's distance between pins, in mm. JST-XH's 2.5 mm is within the
# tolerance of 2.54, so it fits a standard board.
CONNECTOR_PITCH_MM = {
    ConnectorType.HEADER_MALE: 2.54,
    ConnectorType.HEADER_FEMALE: 2.54,
    ConnectorType.JST_XH: 2.5,
    ConnectorType.SCREW_508: 5.08,
}
# The breadboard pattern: 14 rows. Rows 1–2 and 13–14 are power rails along the whole
# board; rows 3–7 and 8–12 are joined in columns of five, each side of the gap.
BREADBOARD_STRIPS = 14
BREADBOARD_RAILS = (1, 2, 13, 14)
BREADBOARD_BLOCKS = ((3, 7), (8, 12))

Cell = tuple[int, int]  # (strip, hole), from 1


# Labels -------------------------------------------------------------------------------


def strip_label(strip: int) -> str:
    """1 → A, 26 → Z, 27 → AA."""
    text = ""
    while strip > 0:
        strip, rest = divmod(strip - 1, 26)
        text = chr(ord("A") + rest) + text
    return text


def label(cell: Cell) -> str:
    return f"{strip_label(cell[0])}{cell[1]}"


_LABEL = re.compile(r"^([A-Za-z]+)(\d+)$")


def parse_label(text: str) -> Cell:
    """'C14' → (3, 14)."""
    match = _LABEL.match(text.strip())
    if not match:
        raise ValueError(f'"{text}" isn\'t a hole: a strip letter and a hole number, like C14')
    strip = 0
    for char in match[1].upper():
        strip = strip * 26 + ord(char) - ord("A") + 1
    return strip, int(match[2])


# Geometry -----------------------------------------------------------------------------


def rotate(x: float, y: float, rotation: int) -> tuple[float, float]:
    """Clockwise in the top view (y down)."""
    if rotation == 90:
        return -y, x
    if rotation == 180:
        return -x, -y
    if rotation == 270:
        return y, -x
    return x, y


def to_steps(mm: float, pitch: float = PITCH_MM) -> int | None:
    """mm along the board as whole holes, or None when it's off the grid."""
    steps = round(mm / pitch)
    return steps if abs(mm - steps * pitch) <= GRID_TOLERANCE_MM else None


def connector_step(connector: Connector, pitch: float) -> int | None:
    """Holes between a connector's pins on a board, or None when they don't fit it."""
    step = to_steps(CONNECTOR_PITCH_MM[connector.type], pitch)
    return step if step else None


def footprint_sig(part: Part) -> str:
    """A fingerprint of the part's footprint, to notice it changing after placing."""
    data = [part.body_mm, sorted((p.id, p.x_mm, p.y_mm) for p in part.pins)]
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]


@dataclass
class PlacedPin:
    key: str  # `ref.PIN`
    placement: Placement
    pin: Pin
    cell: Cell


@dataclass
class PartOnBoard:
    layout_part: LayoutPart
    pins: list[PlacedPin] = field(default_factory=list)
    # Pins (not NC) with no hole in the footprint, and holes off the 2.54 mm grid.
    missing: list[str] = field(default_factory=list)
    off_grid: list[str] = field(default_factory=list)
    # The body as (strip0, hole0, strip1, hole1) in fractional board steps.
    body: tuple[float, float, float, float] | None = None

    @property
    def ref(self) -> str:
        return self.layout_part.placement.ref

    def covers(self, cell: Cell) -> bool:
        """Whether the hole is under the body (strictly inside its outline)."""
        if self.body is None:
            return False
        s0, h0, s1, h1 = self.body
        margin = 0.05
        return s0 + margin < cell[0] < s1 - margin and h0 + margin < cell[1] < h1 - margin


def place_part(layout_part: LayoutPart, pitch: float = PITCH_MM) -> PartOnBoard:
    placement = layout_part.placement
    part = placement.part
    out = PartOnBoard(layout_part)
    origin = (layout_part.strip or 0, layout_part.hole or 0)
    for pin in part.pins:
        if pin.x_mm is None or pin.y_mm is None:
            if pin.kind != PinKind.NC:
                out.missing.append(pin.name)
            continue
        x, y = rotate(pin.x_mm, pin.y_mm, layout_part.rotation)
        along, across = to_steps(x, pitch), to_steps(y, pitch)
        if along is None or across is None:
            out.off_grid.append(pin.name)
            continue
        cell = (origin[0] + across, origin[1] + along)
        out.pins.append(PlacedPin(f"{placement.ref}.{pin.name}", placement, pin, cell))
    if part.body_mm:
        b = part.body_mm
        corners = [
            rotate(x, y, layout_part.rotation)
            for x in (b["x"], b["x"] + b["w"])
            for y in (b["y"], b["y"] + b["h"])
        ]
        xs, ys = [c[0] / pitch for c in corners], [c[1] / pitch for c in corners]
        out.body = (
            origin[0] + min(ys),
            origin[1] + min(xs),
            origin[0] + max(ys),
            origin[1] + max(xs),
        )
    return out


def connector_cells(connector: Connector, pitch: float = PITCH_MM) -> list[Cell]:
    """Each pin's hole, pin 1 first; empty while the connector is off the board, or when
    its pins don't fit the board's holes."""
    step = connector_step(connector, pitch)
    if connector.strip is None or connector.hole is None or step is None:
        return []
    cells = []
    for i in range(connector.pin_count):
        x, y = rotate(i * step, 0, connector.rotation)
        cells.append((connector.strip + round(y), connector.hole + round(x)))
    return cells


def jumper_path(jumper: Jumper) -> list[Cell]:
    """The holes a straight jumper lies over, end to end; just the ends if diagonal."""
    a, b = (jumper.a_strip, jumper.a_hole), (jumper.b_strip, jumper.b_hole)
    if a[0] == b[0]:
        lo, hi = sorted((a[1], b[1]))
        return [(a[0], h) for h in range(lo, hi + 1)]
    if a[1] == b[1]:
        lo, hi = sorted((a[0], b[0]))
        return [(s, a[1]) for s in range(lo, hi + 1)]
    return [a, b]


def is_diagonal(jumper: Jumper) -> bool:
    return jumper.a_strip != jumper.b_strip and jumper.a_hole != jumper.b_hole


def jumper_length(jumper: Jumper) -> float:
    """In holes."""
    return ((jumper.a_strip - jumper.b_strip) ** 2 + (jumper.a_hole - jumper.b_hole) ** 2) ** 0.5


# Connectivity -------------------------------------------------------------------------


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def join(self, a, b) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _group(pin: Pin) -> str | None:
    """The pins of a part joined inside it: its grounds, and pins sharing a tie."""
    return "\0ground" if pin.kind == PinKind.GROUND else pin.tie


@dataclass
class Segment:
    """A run of joined copper, straight: part of a strip, or a breadboard column."""

    a: Cell
    b: Cell
    nets: list[str]
    # Joins pins that the design keeps apart (counting unwired pins): a short.
    short: bool = False


@dataclass
class Board:
    layout: Layout
    design: Design
    parts: list[PartOnBoard]
    # Off-board parts, and placements not placed yet.
    off_board: list[LayoutPart]
    not_placed: list[Placement]
    uf: _UnionFind
    # Every design pin the board has: soldered in a hole, or carried by a connector.
    present: dict[str, Cell]
    # Design net (or, for an unwired pin, its own identity) for each pin key.
    net_of: dict[str, str]
    # Each design net's pins, by net name.
    nets: dict[str, list[str]]
    copper: set[Cell]
    cut_holes: set[Cell]
    cut_between: set[Cell]
    segments: list[Segment] = field(default_factory=list)

    def inside(self, cell: Cell) -> bool:
        return 1 <= cell[0] <= self.layout.strips and 1 <= cell[1] <= self.layout.holes

    def node(self, key) -> object:
        return self.uf.find(key)


def _copper_links(layout: Layout, copper: set[Cell], between: set[Cell]) -> list[list[Cell]]:
    """Runs of joined copper, each a list of holes in order."""
    runs: list[list[Cell]] = []
    if layout.board_type == BoardType.BREADBOARD:
        for strip in BREADBOARD_RAILS:
            if strip <= layout.strips:
                runs.append([(strip, h) for h in range(1, layout.holes + 1)])
        for top, bottom in BREADBOARD_BLOCKS:
            for hole in range(1, layout.holes + 1):
                runs.append([(s, hole) for s in range(top, min(bottom, layout.strips) + 1)])
        return runs
    for strip in range(1, layout.strips + 1):
        run: list[Cell] = []
        for hole in range(1, layout.holes + 1):
            cell = (strip, hole)
            if cell not in copper:
                if run:
                    runs.append(run)
                run = []
                continue
            run.append(cell)
            if cell in between:
                runs.append(run)
                run = []
        if run:
            runs.append(run)
    return runs


def build(layout: Layout) -> Board:
    design = layout.design
    uf = _UnionFind()
    cut_holes = {(c.strip, c.hole) for c in layout.cuts if not c.between}
    cut_between = {(c.strip, c.hole) for c in layout.cuts if c.between}
    all_cells = {(s, h) for s in range(1, layout.strips + 1) for h in range(1, layout.holes + 1)}
    copper = all_cells - cut_holes
    runs = _copper_links(layout, copper, cut_between)
    for run in runs:
        for cell in run:
            uf.find(cell)
        for a, b in zip(run, run[1:], strict=False):
            uf.join(a, b)

    for jumper in layout.jumpers:
        node = ("jumper", jumper.id)
        ends = [(jumper.a_strip, jumper.a_hole), (jumper.b_strip, jumper.b_hole)]
        touching = ends
        if jumper.side == JumperSide.BOTTOM and not jumper.insulated:
            touching = jumper_path(jumper)
        for cell in touching:
            uf.join(node, cell)

    placed = {lp.placement_id: lp for lp in layout.parts}
    pitch = layout.pitch_mm
    parts = [place_part(lp, pitch) for lp in layout.parts if lp.on_board and lp.strip is not None]
    off_board = [lp for lp in layout.parts if not lp.on_board or lp.strip is None]
    not_placed = [p for p in design.placements if p.id not in placed]
    present: dict[str, Cell] = {}
    for part in parts:
        for pin in part.pins:
            present[pin.key] = pin.cell
            uf.join(pin.key, pin.cell)
    for connector in layout.connectors:
        cells = connector_cells(connector, pitch)
        for cpin in connector.pins:
            if cpin.index > len(cells):
                continue
            node = ("connector", connector.id, cpin.index)
            uf.join(node, cells[cpin.index - 1])
            if cpin.placement is not None and cpin.pin is not None:
                key = f"{cpin.placement.ref}.{cpin.pin.name}"
                present.setdefault(key, cells[cpin.index - 1])
                uf.join(node, key)

    # Pins joined inside their part, and each pin's design net.
    net_of: dict[str, str] = {}
    nets: dict[str, list[str]] = {}
    for net in compute_nets(design):
        nets[net.name] = [p.key for p in net.pins]
        for pin in net.pins:
            net_of[pin.key] = net.name
    for placement in design.placements:
        groups: dict[str, list[str]] = {}
        for pin in placement.part.pins:
            key = f"{placement.ref}.{pin.name}"
            if (group := _group(pin)) is not None:
                groups.setdefault(group, []).append(key)
            # An unwired pin is its own net, or its group's: on a strip with a net it
            # would short something.
            net_of.setdefault(key, f"{placement.ref}.{group}" if group else key)
        for members in groups.values():
            for key in members[1:]:
                uf.join(members[0], key)

    board = Board(
        layout=layout,
        design=design,
        parts=parts,
        off_board=off_board,
        not_placed=not_placed,
        uf=uf,
        present=present,
        net_of=net_of,
        nets=nets,
        copper=copper,
        cut_holes=cut_holes,
        cut_between=cut_between,
    )
    # Which design nets each node carries, for drawing the copper tinted by net.
    carried: dict[object, set[str]] = {}
    identities: dict[object, set[str]] = {}
    for key in present:
        name = net_of.get(key, key)
        identities.setdefault(uf.find(key), set()).add(name)
        if name in nets:
            carried.setdefault(uf.find(key), set()).add(name)
    for run in runs:
        node = uf.find(run[0])
        names = carried.get(node, set())
        short = len(identities.get(node, set())) > 1
        board.segments.append(Segment(run[0], run[-1], sorted(names), short))
    return board
