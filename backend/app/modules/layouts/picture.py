"""A text picture of a board (build step 18), for Claude, who reads a grid of characters
far better than lists of coordinates.

One line per strip (row), in the top view, two characters per hole: the hole's mark,
then the gap after it (`|` where a cut separates it from the next hole). Each line ends
with the copper runs on that strip and the design nets they carry. A legend follows.

Marks, strongest first: a part's pin (its letter), a connector pin (its number), a top
jumper end `*`, a bottom link end `+`, a cut at the hole `x`, a hole under a part's body
(the part's letter in lower case), a plain hole `.`.
"""

from app.modules.layouts.board import Board, connector_cells, label, strip_label
from app.modules.layouts.models import BoardType, JumperSide, Mount

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _symbols(refs: list[str]) -> dict[str, str]:
    """A distinct capital letter per part: the first of its ref's letters still free."""
    taken: dict[str, str] = {}
    used: set[str] = set()
    for ref in refs:
        choice = next(
            (c for c in ref.upper() if c in LETTERS and c not in used),
            next((c for c in LETTERS if c not in used), "?"),
        )
        taken[ref] = choice
        used.add(choice)
    return taken


def render(board: Board) -> str:
    layout = board.layout
    marks: dict[tuple[int, int], tuple[str, int]] = {}

    def put(cell: tuple[int, int], mark: str, rank: int) -> None:
        current = marks.get(cell)
        if current is None or rank < current[1]:
            marks[cell] = (mark, rank)

    symbols = _symbols([p.ref for p in board.parts])
    for part in board.parts:
        for pin in part.pins:
            put(pin.cell, symbols[part.ref], 0)
        if part.body:
            for s in range(1, layout.strips + 1):
                for h in range(1, layout.holes + 1):
                    if part.covers((s, h)):
                        put((s, h), symbols[part.ref].lower(), 5)
    numbers = {c.id: str(i % 10) for i, c in enumerate(layout.connectors, start=1)}
    for connector in layout.connectors:
        for cell in connector_cells(connector, layout.pitch_mm):
            put(cell, numbers[connector.id], 1)
    for j in layout.jumpers:
        end = "*" if j.side == JumperSide.TOP else "+"
        for cell in ((j.a_strip, j.a_hole), (j.b_strip, j.b_hole)):
            put(cell, end, 2 if j.side == JumperSide.TOP else 3)
    for cell in board.cut_holes:
        put(cell, "x", 4)

    width = len(strip_label(layout.strips))
    # Hole numbers every five holes, over their columns.
    ruler = [" "] * (layout.holes * 2)
    for h in [1, *range(5, layout.holes + 1, 5)]:
        text = str(h)
        for i, char in enumerate(text):
            if (h - 1) * 2 + i < len(ruler):
                ruler[(h - 1) * 2 + i] = char
    lines = [" " * (width + 1) + "".join(ruler).rstrip()]

    runs: dict[int, list[str]] = {}
    for seg in board.segments:
        if seg.a[0] != seg.b[0]:
            continue  # a breadboard column: shown by the pattern, not per row
        if seg.short:
            what = "SHORT " + ("+".join(seg.nets) if seg.nets else "(unwired pins)")
        elif seg.nets:
            what = seg.nets[0]
        else:
            continue
        runs.setdefault(seg.a[0], []).append(f"{seg.a[1]}-{seg.b[1]} {what}")

    for s in range(1, layout.strips + 1):
        row = []
        for h in range(1, layout.holes + 1):
            mark = marks.get((s, h), (".", 9))[0]
            gap = "|" if (s, h) in board.cut_between else " "
            row.append(mark + gap)
        line = f"{strip_label(s):>{width}} " + "".join(row).rstrip()
        if s in runs:
            line += "   " + "; ".join(runs[s])
        lines.append(line)

    legend = [
        "",
        "Parts: "
        + (
            ", ".join(
                f"{symbols[p.ref]} = {p.ref}"
                + (" (socketed)" if p.layout_part.mount == Mount.SOCKETED else "")
                for p in board.parts
            )
            or "none on the board"
        ),
        "Lower case: under that part's body. "
        + "Socketed parts sit raised: their lower-case holes are free on top.",
    ]
    if layout.connectors:
        legend.append(
            "Connectors (pin 1 first): "
            + ", ".join(
                f"{numbers[c.id]} = {c.ref}"
                + (f" at {label((c.strip, c.hole))}" if c.strip is not None else " (off the board)")
                for c in layout.connectors
            )
        )
    legend.append(
        "* top jumper end, + bottom link end, x cut at the hole, | cut between holes, . hole"
    )
    if layout.board_type == BoardType.BREADBOARD:
        legend.append(
            "Breadboard pattern: rows A, B, M and N are rails along the whole board; "
            "C–G and H–L are joined in columns of five."
        )
    return "\n".join(lines + legend)
