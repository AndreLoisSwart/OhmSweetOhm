"""Build order: the suggested order to build and wire a design's parts in.

Rules in docs/data-model.md (Suggested build order). Nothing here is saved: the canvas
and Claude set the order they agree on.
"""

from collections import Counter

from app.modules.designs.models import Design, Placement
from app.modules.parts.models import PartKind


def suggest(design: Design) -> dict[str, int]:
    """Each placement's suggested step, by ref, numbered 1, 2, 3…"""
    placements = list(design.placements)
    wires_between: Counter[tuple[int, int]] = Counter()
    wired: set[int] = set()
    for w in design.wires:
        if w.a_placement_id == w.b_placement_id:
            continue
        wires_between[(w.a_placement_id, w.b_placement_id)] += 1
        wires_between[(w.b_placement_id, w.a_placement_id)] += 1
        wired |= {w.a_placement_id, w.b_placement_id}

    def kind(p: Placement) -> PartKind:
        return p.part.kind

    boards = [p for p in placements if kind(p) == PartKind.BOARD]
    power = [p for p in placements if kind(p) == PartKind.POWER]
    passives = [p for p in placements if kind(p) == PartKind.PASSIVE]
    others = [p for p in placements if kind(p) not in (PartKind.BOARD, PartKind.POWER)]
    others = [p for p in others if kind(p) != PartKind.PASSIVE]

    # A passive joins the main part it has the most wires to (ties: the lower ref).
    helps: dict[int, list[Placement]] = {}
    alone: list[Placement] = []
    for passive in passives:
        best = min(
            (p for p in others if wires_between[(passive.id, p.id)]),
            key=lambda p: (-wires_between[(passive.id, p.id)], p.ref),
            default=None,
        )
        if best is None:
            alone.append(passive)
        else:
            helps.setdefault(best.id, []).append(passive)

    # Wired parts first, then top to bottom and left to right on the canvas.
    def reading(p: Placement):
        return (p.id not in wired, p.y, p.x, p.ref)

    groups: list[list[Placement]] = []
    if boards:
        groups.append(boards)
    if power:
        groups.append(power)
    for p in sorted(others + alone, key=reading):
        groups.append([p, *helps.get(p.id, [])])

    return {p.ref: n for n, group in enumerate(groups, start=1) for p in group}
