"""The build sheet (build step 19): what to do at the bench, in order, from a layout.

Cuts are listed strip by strip, left to right as seen from the copper side (hole numbers
falling), the way you work along a turned-over board. Jumpers, cuts and connectors are
numbered here, and the printed drawings use the same numbers.
"""

from dataclasses import dataclass, field

from app.modules.layouts import board as boards
from app.modules.layouts import checks as layout_checks
from app.modules.layouts.board import connector_cells, label
from app.modules.layouts.models import BoardType, ConnectorType, JumperSide, Layout, Mount
from app.modules.parts.models import PinKind

# Extra wire per jumper for its two legs through the board (top jumpers).
LEG_ALLOWANCE_MM = 10
CONNECTOR_NAMES = {
    ConnectorType.HEADER_FEMALE: "female header",
    ConnectorType.HEADER_MALE: "male header",
    ConnectorType.JST_XH: "JST-XH",
    ConnectorType.SCREW_508: "screw terminal (5.08 mm)",
}


@dataclass
class SheetCut:
    number: int
    cut_id: int
    at: str  # "C9" or "C9-10"
    between: bool


@dataclass
class SheetJumper:
    number: int
    jumper_id: int
    a: str
    b: str
    side: str
    insulated: bool
    color: str
    holes: float
    mm: float
    # Wire to cut: a top jumper or insulated link also needs its legs.
    cut_mm: float


@dataclass
class SheetPart:
    ref: str
    part: str
    at: str | None
    rotation: int
    mount: str
    on_board: bool


@dataclass
class SheetConnector:
    ref: str
    type: str
    pin_count: int
    at: str | None
    # pin number → what it carries.
    pins: list[str | None]
    # The off-board parts it serves, and whether the cable runs straight (each part's
    # pins in their own order).
    serves: list[str]
    straight: bool


@dataclass
class Sheet:
    title: str
    board: str
    errors: int
    missing: int
    warnings: list[str]
    cuts: list[SheetCut]
    jumpers: list[SheetJumper]
    parts: list[SheetPart]
    connectors: list[SheetConnector]
    shopping: list[str]
    steps: list[str] = field(default_factory=list)


def _header_rows(lp) -> list[int]:
    """Pin counts of a socketed part's header rows, from its footprint: its holes
    grouped into columns (or rows, if the part's header runs the other way)."""
    pins = [p for p in lp.placement.part.pins if p.x_mm is not None and p.kind != PinKind.NC]
    xs = {round(p.x_mm, 1) for p in pins}
    ys = {round(p.y_mm, 1) for p in pins}
    key = (lambda p: round(p.x_mm, 1)) if len(xs) <= len(ys) else (lambda p: round(p.y_mm, 1))
    rows: dict[float, int] = {}
    for p in pins:
        rows[key(p)] = rows.get(key(p), 0) + 1
    return sorted(rows.values(), reverse=True)


def build(layout: Layout) -> Sheet:
    board = boards.build(layout)
    checked = layout_checks.check(board)
    pitch = layout.pitch_mm

    cuts = sorted(layout.cuts, key=lambda c: (c.strip, -c.hole, c.between))
    sheet_cuts = [
        SheetCut(
            n,
            c.id,
            f"{label((c.strip, c.hole))}-{c.hole + 1}" if c.between else label((c.strip, c.hole)),
            c.between,
        )
        for n, c in enumerate(cuts, start=1)
    ]

    jumpers = []
    for n, j in enumerate(layout.jumpers, start=1):
        holes = boards.jumper_length(j)
        mm = holes * pitch
        legs = j.side == JumperSide.TOP or j.insulated
        jumpers.append(
            SheetJumper(
                number=n,
                jumper_id=j.id,
                a=label((j.a_strip, j.a_hole)),
                b=label((j.b_strip, j.b_hole)),
                side=j.side.value,
                insulated=j.insulated,
                color=j.color.value,
                holes=round(holes, 1),
                mm=round(mm, 1),
                cut_mm=round(mm + (LEG_ALLOWANCE_MM if legs else 0)),
            )
        )

    parts = [
        SheetPart(
            ref=lp.placement.ref,
            part=lp.placement.part.name,
            at=label((lp.strip, lp.hole)) if lp.on_board and lp.strip is not None else None,
            rotation=lp.rotation,
            mount=lp.mount.value,
            on_board=lp.on_board,
        )
        for lp in sorted(layout.parts, key=lambda p: (not p.on_board, p.placement.ref))
    ]

    connectors = []
    for c in layout.connectors:
        by_index = {p.index: p for p in c.pins}
        carried = []
        serves: list[str] = []
        straight = True
        last: dict[str, int] = {}
        for i in range(1, c.pin_count + 1):
            p = by_index.get(i)
            if p is None or p.placement is None or p.pin is None:
                carried.append(None)
                continue
            carried.append(f"{p.placement.ref}.{p.pin.name}")
            ref = p.placement.ref
            if ref not in serves:
                serves.append(ref)
            order = [x.id for x in p.placement.part.pins].index(p.pin.id)
            if ref in last and order < last[ref]:
                straight = False
            last[ref] = order
        connectors.append(
            SheetConnector(
                ref=c.ref,
                type=CONNECTOR_NAMES[c.type],
                pin_count=c.pin_count,
                at=label((c.strip, c.hole)) if connector_cells(c, pitch) else None,
                pins=carried,
                serves=serves,
                straight=straight,
            )
        )

    # What to have ready: the board, sockets, connectors and wire.
    kind = "Stripboard" if layout.board_type == BoardType.STRIPBOARD else "Breadboard-pattern board"
    shopping = [f"{kind}, {layout.strips} × {layout.holes} holes, {pitch:g} mm pitch"]
    headers: dict[int, int] = {}
    for lp in layout.parts:
        if lp.on_board and lp.mount == Mount.SOCKETED:
            for count in _header_rows(lp):
                headers[count] = headers.get(count, 0) + 1
    for count, n in sorted(headers.items(), reverse=True):
        shopping.append(f"{n} × {count}-pin female header (sockets)")
    by_type: dict[tuple[str, int], list[str]] = {}
    for c in layout.connectors:
        by_type.setdefault((CONNECTOR_NAMES[c.type], c.pin_count), []).append(c.ref)
    for (name, count), refs in sorted(by_type.items()):
        shopping.append(f"{len(refs)} × {count}-pin {name} ({', '.join(refs)})")
    insulated = sum(j.cut_mm for j in jumpers if j.side == "top" or j.insulated)
    bare = sum(j.cut_mm for j in jumpers if j.side == "bottom" and not j.insulated)
    if insulated:
        shopping.append(f"About {insulated / 10:.0f} cm of insulated hook-up wire for jumpers")
    if bare:
        shopping.append(f"About {bare / 10:.0f} cm of bare tinned wire for bottom links")

    steps = []
    if sheet_cuts:
        steps.append(f"Turn the board over and make the {len(sheet_cuts)} cuts (copper side)")
    if any(j.side == "bottom" for j in jumpers):
        steps.append("Solder the bottom links on the copper side")
    if any(j.side == "top" for j in jumpers):
        steps.append("Fit and solder the top jumpers, shortest first")
    if any(p.on_board and p.mount == "soldered" for p in parts):
        steps.append("Solder the low parts, then the taller ones")
    if headers:
        steps.append("Solder the female headers for the socketed modules")
    if connectors:
        steps.append("Solder the connectors, pin 1 where marked")
    steps.append("Check for solder bridges between strips, then plug in the modules")

    errors = sum(1 for r in checked.results if r.severity.value == "error")
    warnings = [r.message for r in checked.results if r.severity.value == "error"][:5]
    return Sheet(
        title=f"{layout.design.name}: {layout.name}",
        board=shopping[0],
        errors=errors,
        missing=len(checked.links),
        warnings=warnings,
        cuts=sheet_cuts,
        jumpers=jumpers,
        parts=parts,
        connectors=connectors,
        shopping=shopping,
        steps=steps,
    )


def as_text(sheet: Sheet) -> str:
    """The sheet as plain text (Markdown), for Claude to walk through or save."""
    out = [f"# Build sheet: {sheet.title}", "", sheet.board, ""]
    if sheet.errors or sheet.missing:
        out += [
            f"**Not finished:** {sheet.errors} error(s), {sheet.missing} connection(s) still "
            "missing. Fix the layout before building.",
            "",
        ]
    out += ["## Order of work", *[f"{i}. {s}" for i, s in enumerate(sheet.steps, 1)], ""]
    if sheet.cuts:
        out += ["## Cuts (copper side, strip by strip)"]
        out += [
            f"- [ ] {c.number}. {c.at}{' (between holes)' if c.between else ''}" for c in sheet.cuts
        ]
        out.append("")
    if sheet.jumpers:
        out += ["## Jumpers"]
        out += [
            f"- [ ] {j.number}. {j.a} → {j.b}, {j.side}"
            + (" insulated" if j.insulated and j.side == "bottom" else "")
            + f", {j.color}, {j.holes:g} holes ({j.mm:g} mm), cut {j.cut_mm:g} mm"
            for j in sheet.jumpers
        ]
        out.append("")
    out += ["## Parts"]
    out += [
        f"- [ ] {p.ref} ({p.part}): "
        + (f"pin 1 at {p.at}, turned {p.rotation}°, {p.mount}" if p.on_board else "off the board")
        for p in sheet.parts
    ]
    out.append("")
    if sheet.connectors:
        out += ["## Connectors and cables"]
        for c in sheet.connectors:
            pins = ", ".join(f"{i} {p or '—'}" for i, p in enumerate(c.pins, 1))
            cable = "straight" if c.straight else "crossed: check the order"
            out.append(
                f"- [ ] {c.ref}: {c.pin_count}-pin {c.type}"
                + (f", pin 1 at {c.at}" if c.at else "")
                + f" → {', '.join(c.serves) or 'nothing'}: {pins} ({cable})"
            )
        out.append("")
    out += ["## To have ready", *[f"- {s}" for s in sheet.shopping]]
    return "\n".join(out) + "\n"
