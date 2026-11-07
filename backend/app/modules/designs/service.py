import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError
from app.modules.attachments import storage
from app.modules.attachments.models import Attachment
from app.modules.designs.models import Design, Placement, Wire, WireColor
from app.modules.designs.nets import compute_nets
from app.modules.designs.schemas import (
    CanvasPart,
    DesignCreate,
    DesignDetail,
    DesignUpdate,
    NetOut,
    PlacementIn,
    PlacementOut,
    PlacementUpdate,
    WireIn,
    WireOut,
    WireUpdate,
)
from app.modules.parts import service as parts
from app.modules.parts.models import Part, Pin, PinKind, PinSide
from app.modules.tags import service as tags
from app.modules.tags.models import Tag

GRID = 10


def get_design(session: Session, design_id: int) -> Design:
    design = session.get(Design, design_id)
    if design is None:
        raise NotFoundError(f"Design {design_id} not found")
    return design


def list_designs(
    session: Session, q: str | None = None, tag_ids: list[int] | None = None
) -> list[Design]:
    query = select(Design).order_by(Design.updated_at.desc(), Design.id.desc())
    if q and (q := q.strip()):
        pattern = f"%{q}%"
        query = query.where(or_(Design.name.ilike(pattern), Design.description_md.ilike(pattern)))
    if tag_ids:
        query = query.where(Design.tags.any(Tag.id.in_(tag_ids)))
    return list(session.scalars(query))


def detail(design: Design) -> DesignDetail:
    """The design with its parts, wires as `ref.PIN` and computed nets."""
    parts_used = {p.part.id: p.part for p in design.placements}
    return DesignDetail(
        id=design.id,
        name=design.name,
        shelf_project_id=design.shelf_project_id,
        tags=design.tags,
        part_count=design.part_count,
        updated_at=design.updated_at,
        description_md=design.description_md,
        created_at=design.created_at,
        placements=[PlacementOut.model_validate(p) for p in design.placements],
        wires=[
            WireOut(
                id=w.id,
                a=f"{w.a_placement.ref}.{w.a_pin.name}",
                b=f"{w.b_placement.ref}.{w.b_pin.name}",
                a_placement_id=w.a_placement_id,
                a_pin_id=w.a_pin_id,
                b_placement_id=w.b_placement_id,
                b_pin_id=w.b_pin_id,
                color=w.color,
                label=w.label,
            )
            for w in design.wires
        ],
        parts=[CanvasPart.model_validate(p) for p in parts_used.values()],
        nets=[NetOut(name=n.name, pins=[p.key for p in n.pins]) for n in compute_nets(design)],
    )


def _touch(design: Design) -> None:
    design.updated_at = utcnow()


def create_design(session: Session, data: DesignCreate) -> Design:
    design = Design(
        name=data.name,
        description_md=data.description_md,
        shelf_project_id=data.shelf_project_id,
        tags=tags.get_tags(session, data.tag_ids),
    )
    session.add(design)
    session.commit()
    return design


def update_design(session: Session, design_id: int, data: DesignUpdate) -> Design:
    design = get_design(session, design_id)
    changes = data.model_dump(exclude_unset=True)
    if (tag_ids := changes.pop("tag_ids", None)) is not None:
        design.tags = tags.get_tags(session, tag_ids)
    for field, value in changes.items():
        setattr(design, field, value)
    _touch(design)
    session.commit()
    return design


def delete_design(session: Session, design_id: int) -> None:
    design = get_design(session, design_id)
    # Placements, wires, tag links and attachments go with it.
    files = storage.stored_paths_of(session, Attachment.design_id, design_id)
    session.delete(design)
    session.commit()
    storage.remove_files(files)


# Placements


def _snap(value: int) -> int:
    return round(value / GRID) * GRID


def _base_ref(part: Part) -> str:
    """`bme` from "BME280 breakout", `esp` from "ESP32 DevKit"; the kind if no letters."""
    match = re.match(r"[a-z]+", part.name.lower())
    return (match.group(0) if match else part.kind.value)[:12]


def _free_ref(taken: set[str], base: str) -> str:
    if base not in taken:
        return base
    n = 2
    while f"{base}{n}" in taken:
        n += 1
    return f"{base}{n}"


def _estimated_width(part: Part, rotation: int) -> int:
    """Roughly the card's width (the canvas computes it exactly), for placing new parts."""
    sides = {side: [p for p in part.pins if p.side == side] for side in PinSide}
    if rotation in (90, 270):
        sides[PinSide.TOP], sides[PinSide.LEFT] = sides[PinSide.LEFT], sides[PinSide.TOP]
        sides[PinSide.BOTTOM], sides[PinSide.RIGHT] = sides[PinSide.RIGHT], sides[PinSide.BOTTOM]

    def label(side: PinSide) -> int:
        return max((len(p.name) for p in sides[side]), default=0) * 7 + 14

    across = max(len(sides[PinSide.TOP]), len(sides[PinSide.BOTTOM])) * 20 + 20
    return max(label(PinSide.LEFT) + label(PinSide.RIGHT) + 20, across, len(part.name) * 8 + 24)


def _next_x(design: Design) -> int:
    if not design.placements:
        return 0
    right = max(p.x + _estimated_width(p.part, p.rotation) for p in design.placements)
    return _snap(right + 80)


def add_placements(session: Session, design_id: int, items: list[PlacementIn]) -> Design:
    design = get_design(session, design_id)
    taken = {p.ref for p in design.placements}
    for item in items:
        part = parts.get_part(session, item.part_id)
        if item.ref is not None:
            if item.ref in taken:
                raise ConflictError(f'"{item.ref}" is already used in this design')
            ref = item.ref
        else:
            ref = _free_ref(taken, _base_ref(part))
        taken.add(ref)
        placement = Placement(
            part=part,
            ref=ref,
            x=_snap(item.x) if item.x is not None else _next_x(design),
            y=_snap(item.y) if item.y is not None else 0,
            rotation=item.rotation,
            note=item.note,
        )
        design.placements.append(placement)
    _touch(design)
    session.commit()
    return design


def _get_placement(design: Design, placement_id: int) -> Placement:
    placement = next((p for p in design.placements if p.id == placement_id), None)
    if placement is None:
        raise NotFoundError(f"Placement {placement_id} is not in this design")
    return placement


def update_placement(
    session: Session, design_id: int, placement_id: int, data: PlacementUpdate
) -> Design:
    design = get_design(session, design_id)
    placement = _get_placement(design, placement_id)
    changes = data.model_dump(exclude_unset=True)
    if "ref" in changes and changes["ref"] != placement.ref:
        if any(p.ref == changes["ref"] for p in design.placements):
            raise ConflictError(f'"{changes["ref"]}" is already used in this design')
    for axis in ("x", "y"):
        if axis in changes:
            changes[axis] = _snap(changes[axis])
    for field, value in changes.items():
        setattr(placement, field, value)
    _touch(design)
    session.commit()
    return design


def remove_placement(session: Session, design_id: int, placement_id: int) -> Design:
    design = get_design(session, design_id)
    placement = _get_placement(design, placement_id)
    # Its wires go with it.
    design.wires = [
        w for w in design.wires if placement_id not in (w.a_placement_id, w.b_placement_id)
    ]
    design.placements.remove(placement)
    _touch(design)
    session.commit()
    return design


# Wires

POWER = (PinKind.POWER_OUT, PinKind.POWER_IN)
ROTATION = [
    WireColor.BLUE,
    WireColor.GREEN,
    WireColor.YELLOW,
    WireColor.ORANGE,
    WireColor.PURPLE,
    WireColor.WHITE,
    WireColor.BROWN,
]


def default_color(a: Pin, b: Pin, signal_wires: int) -> WireColor:
    """Red for power, black for ground, else the next colour in the rotation."""
    if a.kind in POWER or b.kind in POWER:
        return WireColor.RED
    if PinKind.GROUND in (a.kind, b.kind):
        return WireColor.BLACK
    return ROTATION[signal_wires % len(ROTATION)]


def _resolve(design: Design, pin_ref: str) -> tuple[Placement, Pin]:
    """`esp.GPIO21` to its placement and pin. Pin names match ignoring case."""
    ref, name = pin_ref.split(".", 1)
    placement = next((p for p in design.placements if p.ref == ref.lower()), None)
    if placement is None:
        raise NotFoundError(f'No part "{ref}" in this design')
    pin = next((p for p in placement.part.pins if p.name.lower() == name.lower()), None)
    if pin is None:
        raise NotFoundError(f'{placement.part.name} ("{ref}") has no pin "{name}"')
    return placement, pin


def add_wires(session: Session, design_id: int, items: list[WireIn]) -> Design:
    design = get_design(session, design_id)
    joined = {
        frozenset({(w.a_placement_id, w.a_pin_id), (w.b_placement_id, w.b_pin_id)})
        for w in design.wires
    }
    # Signal wires so far, so the rotation isn't skipped ahead by power and ground wires.
    count = sum(w.color not in (WireColor.RED, WireColor.BLACK) for w in design.wires)
    for item in items:
        a_placement, a_pin = _resolve(design, item.a)
        b_placement, b_pin = _resolve(design, item.b)
        ends = frozenset({(a_placement.id, a_pin.id), (b_placement.id, b_pin.id)})
        if len(ends) == 1:
            raise ConflictError(f"A wire can't join {item.a} to itself")
        if ends in joined:
            raise ConflictError(f"{item.a} and {item.b} are already wired together")
        joined.add(ends)
        color = item.color or default_color(a_pin, b_pin, count)
        design.wires.append(
            Wire(
                a_placement=a_placement,
                a_pin=a_pin,
                b_placement=b_placement,
                b_pin=b_pin,
                color=color,
                label=item.label,
            )
        )
        count += color not in (WireColor.RED, WireColor.BLACK)
    _touch(design)
    session.commit()
    return design


def _get_wire(design: Design, wire_id: int) -> Wire:
    wire = next((w for w in design.wires if w.id == wire_id), None)
    if wire is None:
        raise NotFoundError(f"Wire {wire_id} is not in this design")
    return wire


def update_wire(session: Session, design_id: int, wire_id: int, data: WireUpdate) -> Design:
    design = get_design(session, design_id)
    wire = _get_wire(design, wire_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(wire, field, value)
    _touch(design)
    session.commit()
    return design


def remove_wire(session: Session, design_id: int, wire_id: int) -> Design:
    design = get_design(session, design_id)
    design.wires.remove(_get_wire(design, wire_id))
    _touch(design)
    session.commit()
    return design
