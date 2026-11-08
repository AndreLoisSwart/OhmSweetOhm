"""Layout checks (build step 15): the board compared with the design's nets, and the
physical rules. Computed whenever read, never stored. docs/future-enhancements.md has
the list, under Protoboard layouts.
"""

from dataclasses import dataclass, field
from itertools import combinations

from app.modules.checks.schemas import Severity
from app.modules.layouts.board import (
    Board,
    Cell,
    connector_cells,
    footprint_sig,
    is_diagonal,
    jumper_length,
    label,
)
from app.modules.layouts.models import BoardType, JumperSide, Mount


@dataclass
class Result:
    id: str
    severity: Severity
    message: str
    pins: list[str] = field(default_factory=list)
    holes: list[str] = field(default_factory=list)
    net: str | None = None


@dataclass
class Link:
    """A connection the design needs that the board doesn't make yet (the ratsnest)."""

    net: str
    a: str
    a_hole: Cell
    b: str
    b_hole: Cell


@dataclass
class Summary:
    on_board: int = 0
    off_board: int = 0
    not_placed: int = 0
    missing: int = 0
    cuts: int = 0
    jumpers: int = 0
    jumper_length: float = 0
    # The holes used, as the strips and holes of their bounding box.
    area_strips: int = 0
    area_holes: int = 0


@dataclass
class Checked:
    results: list[Result]
    links: list[Link]
    summary: Summary


def _users(board: Board) -> dict[Cell, list[tuple[str, str]]]:
    """What goes through each hole: pins, connector pins and top jumper ends, as
    (kind, name) with kind pin, connector or jumper."""
    users: dict[Cell, list[tuple[str, str]]] = {}
    for part in board.parts:
        for pin in part.pins:
            users.setdefault(pin.cell, []).append(("pin", pin.key))
    for connector in board.layout.connectors:
        for i, cell in enumerate(connector_cells(connector), start=1):
            users.setdefault(cell, []).append(("connector", f"{connector.ref} pin {i}"))
    for n, jumper in enumerate(board.layout.jumpers, start=1):
        if jumper.side == JumperSide.TOP:
            for cell in ((jumper.a_strip, jumper.a_hole), (jumper.b_strip, jumper.b_hole)):
                users.setdefault(cell, []).append(("jumper", f"jumper {n}"))
    return users


def _footprints(board: Board) -> list[Result]:
    out = []
    for part in board.parts:
        if part.missing:
            out.append(
                Result(
                    "no_footprint",
                    Severity.ERROR,
                    f"{part.ref} is on the board, but its part has no hole for "
                    f"{', '.join(part.missing)}: give it a footprint, or take it off the board",
                    pins=[f"{part.ref}.{name}" for name in part.missing],
                )
            )
        if part.off_grid:
            out.append(
                Result(
                    "off_grid",
                    Severity.ERROR,
                    f"{part.ref}'s holes for {', '.join(part.off_grid)} aren't on the 2.54 mm "
                    "grid, so it can't sit on this board as it is",
                    pins=[f"{part.ref}.{name}" for name in part.off_grid],
                )
            )
        if part.layout_part.footprint_sig != footprint_sig(part.layout_part.placement.part):
            out.append(
                Result(
                    "layout_out_of_date",
                    Severity.WARNING,
                    f"{part.ref}'s footprint changed after it was placed: check where its pins "
                    "land, then move it to confirm",
                )
            )
    return out


def _physical(board: Board, users: dict[Cell, list[tuple[str, str]]]) -> list[Result]:
    out = []
    edge = sorted(cell for cell in users if not board.inside(cell))
    edge += sorted(
        cell
        for j in board.layout.jumpers
        for cell in ((j.a_strip, j.a_hole), (j.b_strip, j.b_hole))
        if j.side == JumperSide.BOTTOM and not board.inside(cell)
    )
    if edge:
        names = sorted({name for cell in edge for _, name in users.get(cell, [])})
        out.append(
            Result(
                "layout_off_edge",
                Severity.ERROR,
                f"Off the edge of the board: {', '.join(names) or 'a jumper'}",
                holes=[label(c) for c in edge],
            )
        )
    for cell, here in sorted(users.items()):
        if len(here) < 2 or not board.inside(cell):
            continue
        names = [name for _, name in here]
        jumper = any(kind == "jumper" for kind, _ in here)
        out.append(
            Result(
                "jumper_hole_taken" if jumper else "layout_overlap",
                Severity.ERROR,
                f"{' and '.join(names)} need the same hole, {label(cell)}",
                pins=[name for kind, name in here if kind == "pin"],
                holes=[label(cell)],
            )
        )
    for cell in sorted(board.cut_holes):
        if cell in users:
            names = [name for _, name in users[cell]]
            out.append(
                Result(
                    "cut_under_pin",
                    Severity.ERROR,
                    f"The cut at {label(cell)} is under {', '.join(names)}: it would leave it "
                    "unconnected. Cut beside it instead",
                    pins=[name for kind, name in users[cell] if kind == "pin"],
                    holes=[label(cell)],
                )
            )
    # Holes under a soldered part's body are blocked on top.
    for part in board.parts:
        if part.layout_part.mount != Mount.SOLDERED or part.body is None:
            continue
        own = {pin.key for pin in part.pins}
        blocked = sorted(
            (cell, name)
            for cell, here in users.items()
            if part.covers(cell)
            for _, name in here
            if name not in own
        )
        if blocked:
            out.append(
                Result(
                    "under_body",
                    Severity.ERROR,
                    f"Under {part.ref}, which is soldered flat: "
                    f"{', '.join(f'{name} at {label(cell)}' for cell, name in blocked)}. "
                    "Move them, or socket it",
                    pins=[name for _, name in blocked if "." in name],
                    holes=[label(cell) for cell, _ in blocked],
                )
            )
    # Two bodies in the same space, unless one is raised in sockets over the other.
    for a, b in combinations(board.parts, 2):
        if a.body is None or b.body is None:
            continue
        raised = {a.layout_part.mount, b.layout_part.mount} == {Mount.SOCKETED, Mount.SOLDERED}
        if raised:
            continue
        overlap_s = min(a.body[2], b.body[2]) - max(a.body[0], b.body[0])
        overlap_h = min(a.body[3], b.body[3]) - max(a.body[1], b.body[1])
        if overlap_s > 0.05 and overlap_h > 0.05:
            out.append(
                Result(
                    "layout_overlap",
                    Severity.ERROR,
                    f"{a.ref} and {b.ref} take up the same space on the board",
                )
            )
    for n, jumper in enumerate(board.layout.jumpers, start=1):
        if is_diagonal(jumper):
            a, b = (jumper.a_strip, jumper.a_hole), (jumper.b_strip, jumper.b_hole)
            out.append(
                Result(
                    "diagonal_jumper",
                    Severity.NOTE,
                    f"Jumper {n} ({label(a)} → {label(b)}) runs diagonally: straight along or "
                    "across the strips is tidier and easier to check",
                    holes=[label(a), label(b)],
                )
            )
    return out


def _connectors(board: Board) -> list[Result]:
    out = []
    for connector in board.layout.connectors:
        if connector.strip is None:
            out.append(
                Result(
                    "connector_not_placed",
                    Severity.WARNING,
                    f"{connector.ref} isn't on the board yet",
                )
            )
        carried = {p.index for p in connector.pins if p.placement is not None and p.pin is not None}
        empty = [i for i in range(1, connector.pin_count + 1) if i not in carried]
        if empty:
            out.append(
                Result(
                    "unassigned_connector_pin",
                    Severity.WARNING,
                    f"{connector.ref} pin {', '.join(map(str, empty))} "
                    f"{'carries' if len(empty) == 1 else 'carry'} nothing",
                )
            )
    return out


def _nearest(board: Board, a: list[str], b: list[str]) -> tuple[str, str, float]:
    best = None
    for x in a:
        for y in b:
            (s1, h1), (s2, h2) = board.present[x], board.present[y]
            distance = abs(s1 - s2) + abs(h1 - h2)
            if best is None or distance < best[2]:
                best = (x, y, distance)
    return best


def _connections(board: Board) -> tuple[list[Result], list[Link]]:
    out: list[Result] = []
    links: list[Link] = []
    on_board = {part.layout_part.placement_id for part in board.parts}
    off_board = {lp.placement_id: lp for lp in board.off_board}
    by_ref = {p.ref: p for p in board.design.placements}
    unconnected: dict[str, list[str]] = {}

    for name, keys in board.nets.items():
        here = [k for k in keys if k in board.present]
        # Off-board pins need a connector when their net reaches the board.
        reaches = any(by_ref[k.split(".")[0]].id in on_board for k in keys) or here
        for key in keys:
            placement = by_ref[key.split(".")[0]]
            if key not in board.present and placement.id in off_board and reaches:
                unconnected.setdefault(placement.ref, []).append(key)
        groups: dict[object, list[str]] = {}
        for key in here:
            groups.setdefault(board.node(key), []).append(key)
        if len(groups) < 2:
            continue
        # Join the pieces nearest first (a minimum spanning tree), for the ratsnest.
        pieces = list(groups.values())
        joined = [pieces.pop(0)]
        while pieces:
            best = None
            for i, piece in enumerate(pieces):
                for done in joined:
                    a, b, distance = _nearest(board, done, piece)
                    if best is None or distance < best[3]:
                        best = (i, a, b, distance)
            i, a, b, _ = best
            links.append(Link(name, a, board.present[a], b, board.present[b]))
            joined.append(pieces.pop(i))
        missing = [link for link in links if link.net == name]
        out.append(
            Result(
                "layout_missing",
                Severity.ERROR,
                f"{name} isn't joined on the board: "
                + "; ".join(
                    f"{link.a} ({label(link.a_hole)}) to {link.b} ({label(link.b_hole)})"
                    for link in missing
                ),
                pins=sorted(here),
                holes=sorted({label(board.present[k]) for k in here}),
                net=name,
            )
        )
    for ref, keys in sorted(unconnected.items()):
        # In the part's own pin order, so a connector made from them has a straight cable.
        order = {f"{ref}.{pin.name}": i for i, pin in enumerate(by_ref[ref].part.pins)}
        keys.sort(key=lambda k: order.get(k, 0))
        out.append(
            Result(
                "off_board_unconnected",
                Severity.WARNING,
                f"{ref} is off the board: {', '.join(keys)} need a connector pin",
                pins=keys,
            )
        )
    return out, links


def _shorts(board: Board, users: dict[Cell, list[tuple[str, str]]]) -> list[Result]:
    out = []
    by_node: dict[object, list[str]] = {}
    for key in board.present:
        by_node.setdefault(board.node(key), []).append(key)
    for keys in by_node.values():
        nets: dict[str, list[str]] = {}
        for key in sorted(keys):
            nets.setdefault(board.net_of.get(key, key), []).append(key)
        if len(nets) < 2:
            continue
        named = [n if n in board.nets else "not wired in the design" for n in nets]
        hint = _cut_hint(board, nets, users)
        out.append(
            Result(
                "layout_short",
                Severity.ERROR,
                "Joined on the board but not in the design: "
                + "; ".join(f"{n} ({', '.join(nets[k])})" for n, k in zip(named, nets, strict=True))
                + (f". {hint}" if hint else ""),
                pins=sorted(keys),
                holes=sorted({label(board.present[k]) for k in keys}),
            )
        )
    return out


def _cut_hint(board: Board, nets: dict[str, list[str]], users) -> str:
    """Where to cut, when two nets share one stretch of a strip."""
    if board.layout.board_type != BoardType.STRIPBOARD:
        return ""
    on_strip: dict[int, list[tuple[int, str]]] = {}
    for net, keys in nets.items():
        for key in keys:
            strip, hole = board.present[key]
            on_strip.setdefault(strip, []).append((hole, net))
    hints = []
    for strip, items in sorted(on_strip.items()):
        items.sort()
        for (h1, n1), (h2, n2) in zip(items, items[1:], strict=False):
            if n1 == n2:
                continue
            free = [h for h in range(h1 + 1, h2) if (strip, h) not in users]
            if free:
                hints.append(f"cut at {label((strip, free[len(free) // 2]))}")
            else:
                hints.append(f"cut between {label((strip, h1))} and {label((strip, h2))}")
    return ("Try: " + ", ".join(dict.fromkeys(hints))) if hints else ""


def _summary(board: Board, users, links: list[Link]) -> Summary:
    used = [c for c in users if board.inside(c)]
    for j in board.layout.jumpers:
        used += [(j.a_strip, j.a_hole), (j.b_strip, j.b_hole)]
    summary = Summary(
        on_board=len(board.parts),
        off_board=len(board.off_board),
        not_placed=len(board.not_placed),
        missing=len(links),
        cuts=len(board.layout.cuts),
        jumpers=len(board.layout.jumpers),
        jumper_length=round(sum(jumper_length(j) for j in board.layout.jumpers), 1),
    )
    if used:
        strips = [c[0] for c in used]
        holes = [c[1] for c in used]
        summary.area_strips = max(strips) - min(strips) + 1
        summary.area_holes = max(holes) - min(holes) + 1
    return summary


ORDER = {Severity.ERROR: 0, Severity.WARNING: 1, Severity.NOTE: 2}


def check(board: Board) -> Checked:
    users = _users(board)
    connections, links = _connections(board)
    results = [
        *_footprints(board),
        *_physical(board, users),
        *connections,
        *_shorts(board, users),
        *_connectors(board),
    ]
    results.sort(key=lambda r: ORDER[r.severity])
    return Checked(results, links, _summary(board, users, links))
