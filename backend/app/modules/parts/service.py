from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError
from app.modules.attachments import storage
from app.modules.attachments.models import Attachment
from app.modules.designs import queries as designs
from app.modules.parts import footprint
from app.modules.parts.models import Author, Part, PartKind, Pin
from app.modules.parts.schemas import (
    BodyMm,
    FootprintIn,
    FootprintOut,
    Hole,
    HoleOut,
    PartCreate,
    PartUpdate,
    PinIn,
    StarterAdded,
    StarterPartOut,
)
from app.modules.parts.starter import starter_parts
from app.modules.tags import service as tags
from app.modules.tags.models import Tag


def get_part(session: Session, part_id: int) -> Part:
    part = session.get(Part, part_id)
    if part is None:
        raise NotFoundError(f"Part {part_id} not found")
    return part


def list_parts(
    session: Session,
    q: str | None = None,
    kinds: list[PartKind] | None = None,
    tag_ids: list[int] | None = None,
    verified: bool | None = None,
) -> list[Part]:
    query = select(Part).order_by(func.lower(Part.name))
    if q and (q := q.strip()):
        pattern = f"%{q}%"
        query = query.where(or_(Part.name.ilike(pattern), Part.description.ilike(pattern)))
    if kinds:
        query = query.where(Part.kind.in_(kinds))
    if tag_ids:
        query = query.where(Part.tags.any(Tag.id.in_(tag_ids)))
    if verified is not None:
        query = query.where(Part.verified == verified)
    return list(session.scalars(query))


def _check_unique(session: Session, name: str, exclude_id: int | None = None) -> None:
    # The NOCASE column collation makes this comparison case-insensitive.
    existing = session.scalar(select(Part).where(Part.name == name))
    if existing and existing.id != exclude_id:
        raise ConflictError(f'A part named "{existing.name}" already exists')


def _new_pins(pins: list[PinIn]) -> list[Pin]:
    positions: dict[str, int] = {}
    made = []
    for data in pins:
        position = positions.get(data.side, 0)
        positions[data.side] = position + 1
        made.append(Pin(**data.model_dump(exclude={"id"}), position=position))
    return made


def create_part(session: Session, data: PartCreate, author: Author = Author.USER) -> Part:
    _check_unique(session, data.name)
    fields = data.model_dump(exclude={"tag_ids", "pins"})
    part = Part(
        **fields,
        tags=tags.get_tags(session, data.tag_ids),
        pins=_new_pins(data.pins),
        created_by=author,
        # The user's own parts start verified; Claude's wait for the user to check them.
        verified=author == Author.USER,
    )
    session.add(part)
    session.commit()
    # Reload, so the pins come back in side and header order.
    session.refresh(part)
    return part


# Firmware data and the body Claude sets are checked by the user like pins: changing
# them unverifies.
FIRMWARE_FIELDS = ("platform", "platformio_board", "libraries", "body_mm")


def update_part(
    session: Session, part_id: int, data: PartUpdate, author: Author = Author.USER
) -> Part:
    part = get_part(session, part_id)
    changes = data.model_dump(exclude_unset=True)
    if author == Author.CLAUDE and any(
        field in changes and changes[field] != getattr(part, field) for field in FIRMWARE_FIELDS
    ):
        part.verified = False
    if "name" in changes:
        _check_unique(session, changes["name"], exclude_id=part_id)
    low = changes.get("supply_min_v", part.supply_min_v)
    high = changes.get("supply_max_v", part.supply_max_v)
    if low is not None and high is not None and low > high:
        raise ConflictError("The lowest supply voltage is above the highest")
    if (tag_ids := changes.pop("tag_ids", None)) is not None:
        part.tags = tags.get_tags(session, tag_ids)
    for field, value in changes.items():
        setattr(part, field, value)
    part.updated_at = utcnow()
    session.commit()
    return part


def replace_pins(
    session: Session, part_id: int, pins: list[PinIn], author: Author = Author.USER
) -> Part:
    """Sets the part's whole pin list. Pins sent with an id are updated in place (so wires
    to them survive a rename); pins left out are removed; the rest are added.

    Claude can't remove pins (nothing is deleted through MCP), and any change Claude
    makes to the pins sets the part back to unverified.
    """
    part = get_part(session, part_id)
    existing = {pin.id: pin for pin in part.pins}
    for data in pins:
        if data.id is not None and data.id not in existing:
            raise NotFoundError(f"Pin {data.id} is not on this part")
    kept_ids = {data.id for data in pins if data.id is not None}
    if author == Author.CLAUDE:
        if missing := set(existing) - kept_ids:
            names = ", ".join(sorted(existing[pin_id].name for pin_id in missing))
            raise ConflictError(
                f"Pins can't be removed through MCP; ask the user to remove {names} in the "
                "app. Send every existing pin, with its id"
            )
        before = _pin_signature(part.pins)
    if wired := designs.wired_pin_ids(session, set(existing) - kept_ids):
        names = ", ".join(sorted(existing[pin_id].name for pin_id in wired))
        raise ConflictError(f"Wired in a design, so it can't be removed: {names}")
    for pin_id, pin in existing.items():
        if pin_id not in kept_ids:
            part.pins.remove(pin)
    # Move kept pins out of the way first, so swapping two names doesn't trip the
    # unique (part, name) constraint halfway through.
    for pin_id in kept_ids:
        existing[pin_id].name = f"~{pin_id}"
    session.flush()

    positions: dict[str, int] = {}
    for data in pins:
        position = positions.get(data.side, 0)
        positions[data.side] = position + 1
        fields = data.model_dump(exclude={"id"})
        if data.id is not None and "x_mm" not in data.model_fields_set:
            # Left out: the pin keeps its hole (the pin editor doesn't edit footprints).
            del fields["x_mm"], fields["y_mm"]
        if data.id is None:
            part.pins.append(Pin(**fields, position=position))
        else:
            pin = existing[data.id]
            for field, value in fields.items():
                setattr(pin, field, value)
            pin.position = position
    if author == Author.CLAUDE and _pin_signature(part.pins) != before:
        part.verified = False
    part.updated_at = utcnow()
    session.commit()
    session.refresh(part)
    return part


def _pin_signature(pins: list[Pin]) -> list[tuple]:
    """What a pin change is judged on: everything about each pin, in order."""
    return sorted(
        (
            p.side,
            p.position,
            p.name,
            p.kind,
            tuple(p.functions),
            p.voltage,
            tuple(p.flags),
            p.tie or "",
            p.code_name or "",
            p.x_mm if p.x_mm is not None else -1000,
            p.y_mm if p.y_mm is not None else -1000,
        )
        for p in pins
    )


def set_footprint(
    session: Session, part_id: int, data: FootprintIn, author: Author = Author.USER
) -> Part:
    """Sets the part's whole footprint: its body and every pin's hole (pins not listed
    get none). A change by Claude sets the part unverified, as for pins."""
    part = get_part(session, part_id)
    pins = {pin.id: pin for pin in part.pins}
    holes: dict[int, Hole] = {}
    for hole in data.holes:
        if hole.pin_id not in pins:
            raise NotFoundError(f"Pin {hole.pin_id} is not on this part")
        if hole.pin_id in holes:
            raise ConflictError(f"{pins[hole.pin_id].name} is given two holes")
        holes[hole.pin_id] = hole
    spots: dict[tuple[float, float], str] = {}
    for pin_id, hole in holes.items():
        if (other := spots.get((hole.x_mm, hole.y_mm))) is not None:
            raise ConflictError(
                f"{other} and {pins[pin_id].name} are in the same hole "
                f"({hole.x_mm:g}, {hole.y_mm:g} mm)"
            )
        spots[(hole.x_mm, hole.y_mm)] = pins[pin_id].name
    before = (part.body_mm, _pin_signature(part.pins))
    part.body_mm = data.body_mm.model_dump() if data.body_mm else None
    for pin_id, pin in pins.items():
        hole = holes.get(pin_id)
        pin.x_mm, pin.y_mm = (hole.x_mm, hole.y_mm) if hole else (None, None)
    if author == Author.CLAUDE and (part.body_mm, _pin_signature(part.pins)) != before:
        part.verified = False
    part.updated_at = utcnow()
    session.commit()
    session.refresh(part)
    return part


def footprint_from_sides(
    session: Session, part_id: int, span_mm: float | None, pitch_mm: float = footprint.PITCH_MM
) -> FootprintOut:
    """A footprint laid out from the pins' sides (footprint.from_sides), with a body just
    around the pins. Not saved."""
    part = get_part(session, part_id)
    if not part.pins:
        raise ConflictError("The part has no pins yet")
    try:
        holes = footprint.from_sides([p.side for p in part.pins], span_mm, pitch_mm)
    except ValueError as e:
        raise ConflictError(str(e)) from e
    body = footprint.body_around(holes)
    return FootprintOut(
        body_mm=BodyMm(**body) if body else None,
        holes=[
            HoleOut(pin_id=pin.id, pin=pin.name, x_mm=x, y_mm=y)
            for pin, (x, y) in zip(part.pins, holes, strict=True)
        ],
    )


def append_notes(session: Session, part_id: int, text: str) -> Part:
    """Adds to the part's notes (markdown) after a blank line; never rewrites them."""
    part = get_part(session, part_id)
    part.notes_md = (
        f"{part.notes_md.rstrip()}\n\n{text.strip()}" if part.notes_md.strip() else text.strip()
    )
    part.updated_at = utcnow()
    session.commit()
    return part


def copy_part(session: Session, part_id: int) -> Part:
    """A new, verified part with the same fields, pins and tags (not the attachments)."""
    source = get_part(session, part_id)
    name = f"{source.name} (copy)"
    n = 2
    while session.scalar(select(Part).where(Part.name == name)):
        name = f"{source.name} (copy {n})"
        n += 1
    part = Part(
        name=name,
        kind=source.kind,
        description=source.description,
        logic_voltage=source.logic_voltage,
        supply_min_v=source.supply_min_v,
        supply_max_v=source.supply_max_v,
        i2c_addresses=list(source.i2c_addresses),
        datasheet_url=source.datasheet_url,
        notes_md=source.notes_md,
        shelf_item_id=None,
        wokwi_type=source.wokwi_type,
        platform=source.platform,
        platformio_board=source.platformio_board,
        libraries=[dict(library) for library in source.libraries],
        body_mm=dict(source.body_mm) if source.body_mm else None,
        tags=list(source.tags),
        created_by=Author.USER,
        verified=True,
        pins=[
            Pin(
                name=pin.name,
                kind=pin.kind,
                functions=list(pin.functions),
                voltage=pin.voltage,
                flags=list(pin.flags),
                side=pin.side,
                position=pin.position,
                wokwi_name=pin.wokwi_name,
                tie=pin.tie,
                code_name=pin.code_name,
                x_mm=pin.x_mm,
                y_mm=pin.y_mm,
            )
            for pin in source.pins
        ],
    )
    session.add(part)
    session.commit()
    # Reload, so the pins come back in side and header order.
    session.refresh(part)
    return part


def delete_part(session: Session, part_id: int) -> None:
    part = get_part(session, part_id)
    if used := designs.designs_using_part(session, part_id):
        names = ", ".join(f'"{d.name}"' for d in used)
        raise ConflictError(f"Placed in {names}; remove it there first")
    # Pins, tag links and attachments go with it (ON DELETE CASCADE); the attachment
    # files are removed once the delete is committed.
    files = storage.stored_paths_of(session, Attachment.part_id, part_id)
    session.delete(part)
    session.commit()
    storage.remove_files(files)


# Starter parts (build step 8)


def _names(session: Session) -> set[str]:
    return {name.lower() for name in session.scalars(select(Part.name))}


def list_starter_parts(session: Session) -> list[StarterPartOut]:
    have = _names(session)
    return [
        StarterPartOut(
            name=p.name, kind=p.kind, pin_count=len(p.pins), present=p.name.lower() in have
        )
        for p in starter_parts()
    ]


def add_starter_parts(session: Session) -> StarterAdded:
    """Adds the starter parts not already in the library (by name). They come in as
    Claude's, so unverified: the user checks each against the real board."""
    have = _names(session)
    added, skipped, updated = [], [], []
    for data in starter_parts():
        if data.name.lower() in have:
            if _fill_firmware_fields(session, data):
                updated.append(data.name)
            else:
                skipped.append(data.name)
            continue
        create_part(session, data, Author.CLAUDE)
        added.append(data.name)
    session.commit()
    return StarterAdded(added=added, skipped=skipped, updated=updated)


def _fill_footprint(part: Part, data: PartCreate) -> bool:
    """The starter footprint, for a part with none at all whose pins all match it by
    name (step 14). A footprint the user has started is never touched."""
    if part.body_mm is not None or any(p.x_mm is not None for p in part.pins):
        return False
    holes = {p.name.lower(): (p.x_mm, p.y_mm) for p in data.pins if p.x_mm is not None}
    if not holes or not part.pins or any(p.name.lower() not in holes for p in part.pins):
        return False
    for pin in part.pins:
        pin.x_mm, pin.y_mm = holes[pin.name.lower()]
    part.body_mm = data.body_mm.model_dump() if data.body_mm else None
    return True


def _fill_firmware_fields(session: Session, data: PartCreate) -> bool:
    """Fills a library part's empty platform, PlatformIO board and libraries (added in
    build step 12), its Wokwi type and pin names (the Wokwi export) and its footprint
    (step 14), from the starter data. Never overwrites what's there."""
    part = session.scalar(select(Part).where(Part.name == data.name))
    filled = False
    if part.platform is None and data.platform is not None:
        part.platform = data.platform
        filled = True
    if part.platformio_board is None and data.platformio_board is not None:
        part.platformio_board = data.platformio_board
        filled = True
    if not part.libraries and data.libraries:
        part.libraries = [library.model_dump() for library in data.libraries]
        filled = True
    if part.wokwi_type is None and data.wokwi_type is not None:
        part.wokwi_type = data.wokwi_type
        filled = True
    filled |= _fill_footprint(part, data)
    wokwi_names = {p.name.lower(): p.wokwi_name for p in data.pins if p.wokwi_name}
    for pin in part.pins:
        if pin.wokwi_name is None and (name := wokwi_names.get(pin.name.lower())):
            pin.wokwi_name = name
            filled = True
    if filled:
        part.updated_at = utcnow()
    return filled
