from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.core.db import SessionDep
from app.modules.designs import queries as designs
from app.modules.parts import service
from app.modules.parts.models import Part, PartKind
from app.modules.parts.schemas import (
    DesignRef,
    PartCreate,
    PartDetail,
    PartSummary,
    PartUpdate,
    PinsReplace,
)

router = APIRouter(prefix="/parts", tags=["parts"])


def part_detail(session: Session, part: Part) -> PartDetail:
    used_in = designs.designs_using_part(session, part.id)
    return PartDetail.model_validate(part).model_copy(
        update={"used_in": [DesignRef.model_validate(d) for d in used_in]}
    )


@router.get("")
def list_parts(
    session: SessionDep,
    q: str | None = None,
    kind: Annotated[list[PartKind] | None, Query()] = None,
    tag_id: Annotated[list[int] | None, Query()] = None,
    verified: bool | None = None,
) -> list[PartSummary]:
    """q searches names and descriptions. Several kind or tag_id values match any of them."""
    parts = service.list_parts(session, q, kind, tag_id, verified)
    return [PartSummary.model_validate(part) for part in parts]


@router.post("", status_code=201)
def create_part(data: PartCreate, session: SessionDep) -> PartDetail:
    return part_detail(session, service.create_part(session, data))


@router.get("/{part_id}")
def get_part(part_id: int, session: SessionDep) -> PartDetail:
    return part_detail(session, service.get_part(session, part_id))


@router.patch("/{part_id}")
def update_part(part_id: int, data: PartUpdate, session: SessionDep) -> PartDetail:
    return part_detail(session, service.update_part(session, part_id, data))


@router.put("/{part_id}/pins")
def replace_pins(part_id: int, data: PinsReplace, session: SessionDep) -> PartDetail:
    return part_detail(session, service.replace_pins(session, part_id, data.pins))


@router.post("/{part_id}/copy", status_code=201)
def copy_part(part_id: int, session: SessionDep) -> PartDetail:
    return part_detail(session, service.copy_part(session, part_id))


@router.delete("/{part_id}", status_code=204)
def delete_part(part_id: int, session: SessionDep) -> None:
    service.delete_part(session, part_id)
