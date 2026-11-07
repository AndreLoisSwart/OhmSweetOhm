from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import ConflictError, NotFoundError
from app.modules.attachments import storage
from app.modules.attachments.models import Attachment
from app.modules.designs import queries as designs
from app.modules.parts.models import Author, Part, PartKind, Pin
from app.modules.parts.schemas import PartCreate, PartUpdate, PinIn
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


def update_part(session: Session, part_id: int, data: PartUpdate) -> Part:
    part = get_part(session, part_id)
    changes = data.model_dump(exclude_unset=True)
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
        )
        for p in pins
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
