"""The physical board (build step 15): where things sit, and what the copper joins.

Geometry: a part's footprint is in mm from its origin (top view, x right, y down). On
the board, x runs along the strips (hole numbers) and y across them (strip letters), at
2.54 mm a step; a rotation turns the footprint clockwise about its origin first.

Connectivity is union-find over nodes: each hole is a node (its solder joint), copper
joins neighbouring holes (stripboard: along a strip, unless cut; breadboard: its fixed
groups; perfboard: none, each hole its own pad), jumpers join their ends (a bare
bottom link on a stripboard or breadboard pattern also every hole it lies across), a
perfboard's traces every pad from end to end, and each pin joins the hole it's soldered
in. A connector pin joins the off-board pin it carries (the cable); one carrying a pin
of a part that's on the board joins nothing, but stands in on that pin's net, so the
copper has to reach it. Pins of a part joined inside it (its
grounds, a tie) are joined here too, as in the design's nets.
"""

import hashlib
import json
import math
import re
from dataclasses import dataclass, field

from app.modules.designs.models import Design, Placement, WireColor
from app.modules.designs.nets import NetRole, compute_nets, pin_role
from app.modules.layouts.models import (
    BoardType,
    Connector,
    ConnectorType,
    Jumper,
    JumperSide,
    Layout,
    LayoutPart,
    Trace,
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


@dataclass(frozen=True)
class ConnectorOutline:
    """A connector type's housing, in mm from pin 1 at rotation 0 (pins along x): `end`
    past the first and the last pin, `back` and `front` either side of the pin row.
    Front (+y, down the board at rotation 0) is the side that matters when mating: a
    JST-XH's latch wall, a screw terminal's wire entry. `clear` is room to leave free
    beyond the front face for the wires, or 0. The pins are seldom in the middle, so
    back and front differ."""

    end: float
    back: float
    front: float
    clear: float = 0


# Approximate housings, from the makers' drawings: pin headers 2.54 mm square per pin;
# JST B?B-XH-A (top entry) 2.5(n-1)+4.9 long and 5.75 deep, the pins 2.35 mm from the
# back; a 5.08 mm screw terminal (KF301/DG301 style) 5.08 per pin and about 7.6 deep,
# wires going in at the front. Check them against your parts' drawings.
CONNECTOR_OUTLINE = {
    ConnectorType.HEADER_MALE: ConnectorOutline(end=1.27, back=1.27, front=1.27),
    ConnectorType.HEADER_FEMALE: ConnectorOutline(end=1.27, back=1.27, front=1.27),
    ConnectorType.JST_XH: ConnectorOutline(end=2.45, back=2.35, front=3.4),
    ConnectorType.SCREW_508: ConnectorOutline(end=2.54, back=3.6, front=4.0, clear=5.0),
}
# The breadboard pattern: 14 rows. Rows 1–2 and 13–14 are power rails along the whole
# board; rows 3–7 and 8–12 are joined in columns of five, each side of the gap.
BREADBOARD_STRIPS = 14
BREADBOARD_RAILS = (1, 2, 13, 14)
BREADBOARD_BLOCKS = ((3, 7), (8, 12))
# A pad's radius, as a fraction of the pitch: a bare wire passing closer than this to a
# hole's centre lies on its pad.
PAD_RADIUS = 0.35

Cell = tuple[int, int]  # (strip, hole), from 1
# An outline on the board: (strip0, hole0, strip1, hole1) in fractional board steps.
Box = tuple[float, float, float, float]
# How far two outlines may run into each other, in steps, and still count as touching.
BOX_MARGIN = 0.05


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
    body: Box | None = None

    @property
    def ref(self) -> str:
        return self.layout_part.placement.ref

    def covers(self, cell: Cell) -> bool:
        """Whether the hole is under the body (strictly inside its outline)."""
        return self.body is not None and box_covers(self.body, cell)


def box_covers(box: Box, cell: Cell) -> bool:
    """Whether the hole is strictly inside the outline."""
    s0, h0, s1, h1 = box
    m = BOX_MARGIN
    return s0 + m < cell[0] < s1 - m and h0 + m < cell[1] < h1 - m


def boxes_overlap(a: Box, b: Box) -> bool:
    """Whether two outlines take up some of the same space (touching doesn't count)."""
    across = min(a[2], b[2]) - max(a[0], b[0])
    along = min(a[3], b[3]) - max(a[1], b[1])
    return across > BOX_MARGIN and along > BOX_MARGIN


def box_label(box: Box) -> str:
    """The holes an outline spans, corner to corner: `B1-D3`."""
    m = BOX_MARGIN
    lo = (max(1, math.ceil(box[0] - m)), max(1, math.ceil(box[1] - m)))
    hi = (math.floor(box[2] + m), math.floor(box[3] + m))
    return f"{label(lo)}-{label(hi)}"


def _box(
    origin: Cell, x0: float, y0: float, x1: float, y1: float, rotation: int, pitch: float
) -> Box:
    """A footprint rectangle in mm (from the origin's hole, before rotating) on the board."""
    corners = [rotate(x, y, rotation) for x in (x0, x1) for y in (y0, y1)]
    xs, ys = [c[0] / pitch for c in corners], [c[1] / pitch for c in corners]
    return (origin[0] + min(ys), origin[1] + min(xs), origin[0] + max(ys), origin[1] + max(xs))


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
        out.body = _box(
            origin, b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"], layout_part.rotation, pitch
        )
    return out


def _connector_span(
    connector: Connector, pitch: float
) -> tuple[Cell, float, ConnectorOutline] | None:
    step = connector_step(connector, pitch)
    if connector.strip is None or connector.hole is None or step is None:
        return None
    # Along the board's holes, not the type's own pitch: a JST-XH's 2.5 mm pins are
    # bent onto 2.54 mm holes, so a long one is longer on the board.
    last = (connector.pin_count - 1) * step * pitch
    return (connector.strip, connector.hole), last, CONNECTOR_OUTLINE[connector.type]


def connector_body(connector: Connector, pitch: float = PITCH_MM) -> Box | None:
    """The connector's housing on the board; None while it isn't on it."""
    span = _connector_span(connector, pitch)
    if span is None:
        return None
    origin, last, o = span
    return _box(origin, -o.end, -o.back, last + o.end, o.front, connector.rotation, pitch)


def connector_keep_clear(connector: Connector, pitch: float = PITCH_MM) -> Box | None:
    """Room to leave free in front of the connector for its wires; None when its type
    needs none, or it isn't on the board."""
    span = _connector_span(connector, pitch)
    if span is None or not span[2].clear:
        return None
    origin, last, o = span
    return _box(origin, -o.end, o.front, last + o.end, o.front + o.clear, connector.rotation, pitch)


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


def ends(item: Jumper | Trace) -> tuple[Cell, Cell]:
    return (item.a_strip, item.a_hole), (item.b_strip, item.b_hole)


def straight_path(a: Cell, b: Cell) -> list[Cell]:
    """The holes from a to b along a row or down a column; just the ends if diagonal."""
    if a[0] == b[0]:
        lo, hi = sorted((a[1], b[1]))
        return [(a[0], h) for h in range(lo, hi + 1)]
    if a[1] == b[1]:
        lo, hi = sorted((a[0], b[0]))
        return [(s, a[1]) for s in range(lo, hi + 1)]
    return [a, b]


def jumper_path(jumper: Jumper) -> list[Cell]:
    """The holes a straight jumper lies over, end to end; just the ends if diagonal."""
    return straight_path(*ends(jumper))


def is_bare_bottom(jumper: Jumper) -> bool:
    return jumper.side == JumperSide.BOTTOM and not jumper.insulated


def jumper_touches(jumper: Jumper, board_type: BoardType) -> list[Cell]:
    """The holes a jumper joins: its ends, and on a stripboard or breadboard pattern
    every hole a bare bottom link lies across (the copper runs under it). On a perfboard
    a jumper joins only its ends; traces join pads."""
    if is_bare_bottom(jumper) and board_type != BoardType.PERFBOARD:
        return jumper_path(jumper)
    return list(ends(jumper))


def trace_path(trace: Trace) -> list[Cell]:
    return straight_path(*ends(trace))


def pads_under(a: Cell, b: Cell, strips: int, holes: int) -> list[Cell]:
    """Holes other than the ends whose pad a straight wire from a to b lies on: their
    centre is within PAD_RADIUS of the line."""
    (s1, h1), (s2, h2) = a, b
    ds, dh = s2 - s1, h2 - h1
    length2 = ds * ds + dh * dh
    out = []
    for s in range(max(1, min(s1, s2)), min(strips, max(s1, s2)) + 1):
        for h in range(max(1, min(h1, h2)), min(holes, max(h1, h2)) + 1):
            if (s, h) in (a, b) or not length2:
                continue
            t = ((s - s1) * ds + (h - h1) * dh) / length2
            t = min(1.0, max(0.0, t))
            gap2 = (s1 + t * ds - s) ** 2 + (h1 + t * dh - h) ** 2
            if gap2 < PAD_RADIUS**2:
                out.append((s, h))
    return out


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


# Jumpers on a rail take its colour, whatever they were given.
RAIL_COLORS = {NetRole.SUPPLY: WireColor.RED, NetRole.GROUND: WireColor.BLACK}


def _group(pin: Pin) -> str | None:
    """The pins of a part joined inside it: its grounds, and pins sharing a tie."""
    return "\0ground" if pin.kind == PinKind.GROUND else pin.tie


@dataclass
class Segment:
    """A run of joined copper, straight: part of a strip, a breadboard column, or a
    perfboard's pad (one hole)."""

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
    # Each design net's role: ground, supply or signal.
    roles: dict[str, NetRole]
    copper: set[Cell]
    cut_holes: set[Cell]
    cut_between: set[Cell]
    segments: list[Segment] = field(default_factory=list)
    # Pins on the board (or a connector) joined inside their part: its grounds, a tie.
    joins: list[list[str]] = field(default_factory=list)
    # Connector pins carrying a pin of a part on the board (`J1.2` → `esp.GND`): each
    # stands in on that pin's net, joined only by copper.
    stand_ins: dict[str, str] = field(default_factory=dict)
    # Which design nets each node carries, and every net identity on it (unwired pins
    # count), for tinting copper and spotting shorts.
    carried: dict[object, set[str]] = field(default_factory=dict)
    identities: dict[object, set[str]] = field(default_factory=dict)

    def inside(self, cell: Cell) -> bool:
        return 1 <= cell[0] <= self.layout.strips and 1 <= cell[1] <= self.layout.holes

    def node(self, key) -> object:
        return self.uf.find(key)

    def tint(self, key) -> tuple[list[str], bool]:
        """The design nets on what key is joined to, and whether it's a short."""
        node = self.uf.find(key)
        return sorted(self.carried.get(node, set())), len(self.identities.get(node, set())) > 1

    def role(self, key) -> NetRole | None:
        """Ground or supply when everything joined to key is that (rails), signal when
        it carries only signals, null when it carries nothing or both ground and supply."""
        roles = {self.roles[n] for n in self.carried.get(self.uf.find(key), set())}
        if roles == {NetRole.SIGNAL}:
            return NetRole.SIGNAL
        roles.discard(NetRole.SIGNAL)
        return roles.pop() if len(roles) == 1 else None

    def jumper_color(self, jumper: Jumper) -> tuple[WireColor, bool]:
        """The colour to draw a jumper in, and whether its net forces it: red on a
        supply, black on ground, else the colour it was given."""
        forced = RAIL_COLORS.get(self.role(("jumper", jumper.id)))
        return (forced, True) if forced else (jumper.color, False)

    def connector_pin_role(self, connector_id: int, index: int, pin: Pin | None) -> NetRole | None:
        """A connector pin's role: its own pin's when it carries a ground or power pin,
        else whatever its hole is joined to."""
        if pin is not None and (own := pin_role(pin.kind)) != NetRole.SIGNAL:
            return own
        return self.role(("connector", connector_id, index))


def _copper_links(layout: Layout, copper: set[Cell], between: set[Cell]) -> list[list[Cell]]:
    """Runs of joined copper, each a list of holes in order. A perfboard's are its pads,
    one hole each, so the board is drawn and tinted the same way."""
    runs: list[list[Cell]] = []
    if layout.board_type == BoardType.PERFBOARD:
        return [[cell] for cell in sorted(copper)]
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
        for cell in jumper_touches(jumper, layout.board_type):
            uf.join(node, cell)
    for trace in layout.traces:
        node = ("trace", trace.id)
        for cell in trace_path(trace):
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
    on_board = {part.layout_part.placement_id for part in parts}
    stand_ins: dict[str, str] = {}
    for connector in layout.connectors:
        cells = connector_cells(connector, pitch)
        for cpin in connector.pins:
            if cpin.index > len(cells):
                continue
            node = ("connector", connector.id, cpin.index)
            uf.join(node, cells[cpin.index - 1])
            if cpin.placement is None or cpin.pin is None:
                continue
            key = f"{cpin.placement.ref}.{cpin.pin.name}"
            if cpin.placement_id in on_board:
                # A test point or header for a pin already on the board: no cable to it,
                # so the copper must reach this hole, which is on that pin's net.
                stand = f"{connector.ref}.{cpin.index}"
                stand_ins[stand] = key
                present[stand] = cells[cpin.index - 1]
                uf.join(node, stand)
                continue
            present.setdefault(key, cells[cpin.index - 1])
            uf.join(node, key)

    # Pins joined inside their part, and each pin's design net.
    net_of: dict[str, str] = {}
    nets: dict[str, list[str]] = {}
    roles: dict[str, NetRole] = {}
    joins: list[list[str]] = []
    for net in compute_nets(design):
        nets[net.name] = [p.key for p in net.pins]
        roles[net.name] = net.role
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
            if len(here := [key for key in members if key in present]) > 1:
                joins.append(here)
    for stand, key in stand_ins.items():
        net_of[stand] = net_of.get(key, key)
        if net_of[stand] in nets:
            nets[net_of[stand]].append(stand)

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
        roles=roles,
        copper=copper,
        cut_holes=cut_holes,
        cut_between=cut_between,
        joins=joins,
        stand_ins=stand_ins,
    )
    for key in present:
        name = net_of.get(key, key)
        board.identities.setdefault(uf.find(key), set()).add(name)
        if name in nets:
            board.carried.setdefault(uf.find(key), set()).add(name)
    for run in runs:
        names, short = board.tint(run[0])
        board.segments.append(Segment(run[0], run[-1], names, short))
    return board
