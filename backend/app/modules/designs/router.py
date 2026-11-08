from typing import Annotated

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.modules.checks.schemas import DesignChecks
from app.modules.checks.service import run_checks
from app.modules.designs import revisions, service
from app.modules.designs.schemas import (
    DesignCreate,
    DesignDetail,
    DesignSummary,
    DesignUpdate,
    PlacementsAdd,
    PlacementUpdate,
    RevisionOut,
    Snapshot,
    SuggestedWiring,
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
    return [service.summary(d) for d in service.list_designs(session, q, tag_id)]


@router.post("", status_code=201)
def create_design(data: DesignCreate, session: SessionDep) -> DesignDetail:
    return service.detail(service.create_design(session, data))


@router.get("/{design_id}")
def get_design(design_id: int, session: SessionDep) -> DesignDetail:
    return service.detail(service.get_design(session, design_id))


@router.patch("/{design_id}")
def update_design(design_id: int, data: DesignUpdate, session: SessionDep) -> DesignDetail:
    return service.detail(service.update_design(session, design_id, data))


@router.get("/{design_id}/checks")
def check_design(design_id: int, session: SessionDep) -> DesignChecks:
    """Every rule in docs/checks.md, errors first. Also part of every design answer."""
    return run_checks(service.get_design(session, design_id))


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


@router.get("/{design_id}/suggest-wiring")
def suggest_wiring(
    design_id: int, ref: str, session: SessionDep, board: str | None = None
) -> SuggestedWiring:
    """Wires for the unwired pins of the part `ref`, to free pins of the board that suit
    them: shared buses, a matching supply, GPIOs away from flash, strapping and
    input-only pins. Read-only: send the ones wanted to add wires."""
    return service.suggest_wiring(service.get_design(session, design_id), ref, board)


@router.put("/{design_id}/layout")
def apply_layout(design_id: int, data: Snapshot, session: SessionDep) -> DesignDetail:
    """Sets all placements and wires at once: the canvas's undo and redo."""
    return service.detail(service.apply_layout(session, design_id, data))


@router.get("/{design_id}/revisions")
def list_revisions(design_id: int, session: SessionDep) -> list[RevisionOut]:
    """Newest first. Each holds the design as it was before the change in its summary."""
    return revisions.list_revisions(service.get_design(session, design_id))


@router.post("/{design_id}/revisions/{revision_id}/restore")
def restore_revision(design_id: int, revision_id: int, session: SessionDep) -> DesignDetail:
    """Saves the current state as a revision first, so the restore can be undone."""
    return service.detail(service.restore_revision(session, design_id, revision_id))
