from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.core.db import SessionDep
from app.modules.designs import queries as designs
from app.modules.parts import service
from app.modules.parts.models import Part, PartKind
from app.modules.parts.schemas import (
    DesignRef,
    FootprintIn,
    FootprintOut,
    PartCreate,
    PartDetail,
    PartSummary,
    PartUpdate,
    PinsReplace,
    StarterAdded,
    StarterPartOut,
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


@router.get("/starter")
def list_starter_parts(session: SessionDep) -> list[StarterPartOut]:
    """The starter modules (docs/mvp.md), and whether each is in the library yet."""
    return service.list_starter_parts(session)


@router.post("/starter")
def add_starter_parts(session: SessionDep) -> StarterAdded:
    """Adds the starter parts that aren't in the library yet, unverified."""
    return service.add_starter_parts(session)


@router.get("/{part_id}")
def get_part(part_id: int, session: SessionDep) -> PartDetail:
    return part_detail(session, service.get_part(session, part_id))


@router.patch("/{part_id}")
def update_part(part_id: int, data: PartUpdate, session: SessionDep) -> PartDetail:
    return part_detail(session, service.update_part(session, part_id, data))


@router.put("/{part_id}/pins")
def replace_pins(part_id: int, data: PinsReplace, session: SessionDep) -> PartDetail:
    return part_detail(session, service.replace_pins(session, part_id, data.pins))


@router.put("/{part_id}/footprint")
def set_footprint(part_id: int, data: FootprintIn, session: SessionDep) -> PartDetail:
    """The part's whole footprint, in mm from its origin: its body and each pin's hole.
    Pins not listed get no hole."""
    return part_detail(session, service.set_footprint(session, part_id, data))


@router.get("/{part_id}/footprint/from-sides")
def footprint_from_sides(
    part_id: int,
    session: SessionDep,
    span_mm: Annotated[float | None, Query(gt=0, le=500)] = None,
    pitch_mm: Annotated[float, Query(gt=0, le=50)] = 2.54,
) -> FootprintOut:
    """Holes laid out from the pins' sides: left and right pins as columns span_mm apart
    (top and bottom as rows), pitch_mm between neighbours. Not saved."""
    return service.footprint_from_sides(session, part_id, span_mm, pitch_mm)


@router.post("/{part_id}/copy", status_code=201)
def copy_part(part_id: int, session: SessionDep) -> PartDetail:
    return part_detail(session, service.copy_part(session, part_id))


@router.delete("/{part_id}", status_code=204)
def delete_part(part_id: int, session: SessionDep) -> None:
    service.delete_part(session, part_id)
