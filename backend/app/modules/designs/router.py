from typing import Annotated

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.modules.designs import service
from app.modules.designs.schemas import (
    DesignCreate,
    DesignDetail,
    DesignSummary,
    DesignUpdate,
    PlacementsAdd,
    PlacementUpdate,
    WiresAdd,
    WireUpdate,
)

router = APIRouter(prefix="/designs", tags=["designs"])

# Every change returns the whole design, so the canvas redraws from one answer.


@router.get("")
def list_designs(
    session: SessionDep,
    q: str | None = None,
    tag_id: Annotated[list[int] | None, Query()] = None,
) -> list[DesignSummary]:
    """Most recently changed first. Several tag_id values match any of them."""
    return [DesignSummary.model_validate(d) for d in service.list_designs(session, q, tag_id)]


@router.post("", status_code=201)
def create_design(data: DesignCreate, session: SessionDep) -> DesignDetail:
    return service.detail(service.create_design(session, data))


@router.get("/{design_id}")
def get_design(design_id: int, session: SessionDep) -> DesignDetail:
    return service.detail(service.get_design(session, design_id))


@router.patch("/{design_id}")
def update_design(design_id: int, data: DesignUpdate, session: SessionDep) -> DesignDetail:
    return service.detail(service.update_design(session, design_id, data))


@router.delete("/{design_id}", status_code=204)
def delete_design(design_id: int, session: SessionDep) -> None:
    service.delete_design(session, design_id)


@router.post("/{design_id}/placements")
def add_placements(design_id: int, data: PlacementsAdd, session: SessionDep) -> DesignDetail:
    return service.detail(service.add_placements(session, design_id, data.parts))


@router.patch("/{design_id}/placements/{placement_id}")
def update_placement(
    design_id: int, placement_id: int, data: PlacementUpdate, session: SessionDep
) -> DesignDetail:
    return service.detail(service.update_placement(session, design_id, placement_id, data))


@router.delete("/{design_id}/placements/{placement_id}")
def remove_placement(design_id: int, placement_id: int, session: SessionDep) -> DesignDetail:
    """Removes the part and its wires."""
    return service.detail(service.remove_placement(session, design_id, placement_id))


@router.post("/{design_id}/wires")
def add_wires(design_id: int, data: WiresAdd, session: SessionDep) -> DesignDetail:
    """Ends are `ref.PIN`, e.g. `esp.GPIO21`. All or none are added."""
    return service.detail(service.add_wires(session, design_id, data.wires))


@router.patch("/{design_id}/wires/{wire_id}")
def update_wire(
    design_id: int, wire_id: int, data: WireUpdate, session: SessionDep
) -> DesignDetail:
    return service.detail(service.update_wire(session, design_id, wire_id, data))


@router.delete("/{design_id}/wires/{wire_id}")
def remove_wire(design_id: int, wire_id: int, session: SessionDep) -> DesignDetail:
    return service.detail(service.remove_wire(session, design_id, wire_id))
