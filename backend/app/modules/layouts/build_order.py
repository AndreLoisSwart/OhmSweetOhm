"""The design's build order on a board (build step 24): which step each jumper, trace and
connector belongs to, worked out from the parts' steps and never stored.

- Parts keep the design's `build_step`; parts not ordered make one last step.
- Step 0, preparing the board: cuts, and a stripboard's or breadboard pattern's bottom
  links (made before any part goes in). Only when there are some.
- Top jumpers, and a perfboard's traces and bottom jumpers: the earliest step at which
  they join two present pins of one design net that would otherwise be apart. Present
  pins are those of parts at that step or earlier, on the board or on a connector.
- Connectors: the earliest step of a part they carry.
- Anything never needed that way (spare or redundant links, empty connectors) joins the
  last step.

Connectivity is worked out per copper run rather than per hole, so each step's check
only touches what's on the board.
"""

from dataclasses import dataclass, field

from app.modules.layouts import board as boards
from app.modules.layouts.board import Board, _UnionFind, straight_path
from app.modules.layouts.models import BoardType, Jumper, JumperSide, Layout

PREPARE = 0

# A step's number; None is the parts not ordered, after every number.
Step = int | None


def _rank(step: Step) -> float:
    return float("inf") if step is None else step


@dataclass
class BoardSteps:
    # The steps in order: PREPARE first when there's anything to prepare, then each of
    # the design's numbers, then None when some parts aren't ordered. Empty when no part
    # is ordered.
    steps: list[Step] = field(default_factory=list)
    jumpers: dict[int, Step] = field(default_factory=dict)
    traces: dict[int, Step] = field(default_factory=dict)
    connectors: dict[int, Step] = field(default_factory=dict)


def _is_prep(jumper: Jumper, board_type: BoardType) -> bool:
    return jumper.side == JumperSide.BOTTOM and board_type != BoardType.PERFBOARD


def derive(layout: Layout, board: Board | None = None) -> BoardSteps:
    design = layout.design
    step_of = {p.ref: p.build_step for p in design.placements}
    if not any(v is not None for v in step_of.values()):
        return BoardSteps()
    board = board or boards.build(layout)
    values: list[Step] = sorted({v for v in step_of.values() if v is not None})
    if None in step_of.values():
        values.append(None)
    last = values[-1]

    prep = [j for j in layout.jumpers if _is_prep(j, layout.board_type)]
    out = BoardSteps(steps=([PREPARE] if layout.cuts or prep else []) + values)
    for j in prep:
        out.jumpers[j.id] = PREPARE

    # Each hole's copper run, so a run is one node.
    run_of: dict[boards.Cell, int] = {}
    for i, seg in enumerate(board.segments):
        for cell in straight_path(seg.a, seg.b):
            run_of[cell] = i

    def node(cell: boards.Cell) -> object:
        return ("run", run_of[cell]) if cell in run_of else ("hole", cell)

    # What each item joins, as nodes; the prep links are always in.
    items: dict[tuple[str, int], list[object]] = {}
    for j in layout.jumpers:
        items[("jumper", j.id)] = [node(c) for c in boards.jumper_touches(j, layout.board_type)]
    for t in layout.traces:
        items[("trace", t.id)] = [node(c) for c in boards.trace_path(t)]
    waiting = [k for k in items if not (k[0] == "jumper" and out.jumpers.get(k[1]) == PREPARE)]
    # A connector pin standing in for a pin on the board comes with that pin's part.
    pin_step = {
        key: step_of.get(board.stand_ins.get(key, key).split(".")[0]) for key in board.present
    }

    def joined(present: set[str], skip: tuple[str, int] | None) -> _UnionFind:
        uf = _UnionFind()
        for key in present:
            uf.join(key, node(board.present[key]))
        for k, nodes in items.items():
            if k == skip:
                continue
            for n in nodes[1:]:
                uf.join(nodes[0], n)
        for group in board.joins:
            here = [key for key in group if key in present]
            for key in here[1:]:
                uf.join(here[0], key)
        return uf

    for value in values:
        if not waiting:
            break
        present = {key for key, s in pin_step.items() if _rank(s) <= _rank(value)}
        wired = [key for key in present if board.net_of.get(key) in board.nets]
        everything = joined(present, None)
        for k in list(waiting):
            without = joined(present, k)
            # Needed: some net's pins joined with it fall apart without it.
            groups: dict[tuple[str, object], set[object]] = {}
            for key in wired:
                groups.setdefault((board.net_of[key], everything.find(key)), set()).add(
                    without.find(key)
                )
            if any(len(roots) > 1 for roots in groups.values()):
                getattr(out, k[0] + "s")[k[1]] = value
                waiting.remove(k)
    for kind, item_id in waiting:
        getattr(out, kind + "s")[item_id] = last

    for c in layout.connectors:
        carried = [
            step_of.get(p.placement.ref) for p in c.pins if p.placement is not None and p.pin
        ]
        out.connectors[c.id] = min(carried, key=_rank) if carried else last
    return out
