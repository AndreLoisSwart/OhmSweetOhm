"""Lookups the parts module needs (guards, "used in"), kept apart to avoid an import cycle."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.modules.designs.models import Design, Placement, Wire


def designs_using_part(session: Session, part_id: int) -> list[Design]:
    query = (
        select(Design)
        .where(Design.placements.any(Placement.part_id == part_id))
        .order_by(func.lower(Design.name))
    )
    return list(session.scalars(query))


def wired_pin_ids(session: Session, pin_ids: set[int]) -> set[int]:
    if not pin_ids:
        return set()
    query = select(Wire.a_pin_id, Wire.b_pin_id).where(
        or_(Wire.a_pin_id.in_(pin_ids), Wire.b_pin_id.in_(pin_ids))
    )
    return {pin for row in session.execute(query) for pin in row if pin in pin_ids}
