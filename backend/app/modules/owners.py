"""Attachments belong to exactly one owner: a part or a design.

Checks the owner exists, filters by owner, and touches its `updated_at`.
"""

from enum import StrEnum

from sqlalchemy import ColumnElement
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import NotFoundError
from app.modules.designs.models import Design
from app.modules.parts.models import Part


class OwnerType(StrEnum):
    PART = "part"
    DESIGN = "design"


MODELS = {OwnerType.PART: Part, OwnerType.DESIGN: Design}


def owner_filter(model, owner_type: OwnerType, owner_id: int) -> ColumnElement[bool]:
    return getattr(model, f"{owner_type}_id") == owner_id


def get_owner(session: Session, owner_type: OwnerType, owner_id: int):
    owner = session.get(MODELS[owner_type], owner_id)
    if owner is None:
        raise NotFoundError(f"{owner_type.capitalize()} {owner_id} not found")
    return owner


def owner_of(record) -> tuple[OwnerType, int]:
    for owner_type in OwnerType:
        if (owner_id := getattr(record, f"{owner_type}_id")) is not None:
            return owner_type, owner_id
    raise ValueError("record has no owner")


def touch_owner(session: Session, owner_type: OwnerType, owner_id: int) -> None:
    get_owner(session, owner_type, owner_id).updated_at = utcnow()
