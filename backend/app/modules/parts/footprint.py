"""Footprints (build step 14): where each pin goes through a board, in mm.

Coordinates are millimetres in the top view, x to the right and y down, from the part's
origin (usually its first pin). The body is the outline the part covers on the board,
`{x, y, w, h}` from the same origin. A protoboard's holes are 2.54 mm apart, so most
modules' pins land on multiples of 2.54.
"""

from app.modules.parts.models import PinSide

PITCH_MM = 2.54
# Around the pins, when a body is made up from them.
BODY_MARGIN_MM = 1.27


def from_sides(
    sides: list[PinSide], span_mm: float | None, pitch_mm: float = PITCH_MM
) -> list[tuple[float, float]]:
    """Holes for pins listed in header order (as stored), laid out from their sides:
    left and right pins become columns `span_mm` apart, top and bottom pins rows
    `span_mm` apart, `pitch_mm` between neighbours. The first pin of the left (or top)
    side is the origin. Parts with both columns and rows are edited by hand."""
    has = set(sides)
    columns = has & {PinSide.LEFT, PinSide.RIGHT}
    rows = has & {PinSide.TOP, PinSide.BOTTOM}
    if columns and rows:
        raise ValueError(
            "The pins are on both the sides and the top or bottom: place the holes by hand"
        )
    if len(columns) == 2 or len(rows) == 2:
        if span_mm is None or span_mm <= 0:
            raise ValueError("Say how far apart the two rows of pins are (span_mm)")
    counts: dict[PinSide, int] = {}
    holes = []
    for side in sides:
        i = counts.get(side, 0)
        counts[side] = i + 1
        along = round(i * pitch_mm, 2)
        if side == PinSide.LEFT:
            holes.append((0.0, along))
        elif side == PinSide.RIGHT:
            holes.append((0.0 if len(columns) == 1 else span_mm, along))
        elif side == PinSide.TOP:
            holes.append((along, 0.0))
        else:
            holes.append((along, 0.0 if len(rows) == 1 else span_mm))
    return holes


def body_around(holes: list[tuple[float, float]]) -> dict | None:
    """A body just around the holes, for a part whose real outline isn't known yet."""
    if not holes:
        return None
    xs, ys = [x for x, _ in holes], [y for _, y in holes]
    return {
        "x": round(min(xs) - BODY_MARGIN_MM, 2),
        "y": round(min(ys) - BODY_MARGIN_MM, 2),
        "w": round(max(xs) - min(xs) + 2 * BODY_MARGIN_MM, 2),
        "h": round(max(ys) - min(ys) + 2 * BODY_MARGIN_MM, 2),
    }
