from fastapi import APIRouter

from app.core.db import SessionDep
from app.modules.layouts import revisions, service
from app.modules.layouts.schemas import (
    ConnectorIn,
    ConnectorUpdate,
    CutsIn,
    JumperIn,
    JumperUpdate,
    LayoutCreate,
    LayoutDetail,
    LayoutRevisionOut,
    LayoutSnapshot,
    LayoutSummary,
    LayoutUpdate,
    PartsPlace,
)

router = APIRouter(tags=["layouts"])

# Every change answers with the whole layout, checks included, so the board redraws
# from one answer.


@router.get("/designs/{design_id}/layouts")
def list_layouts(design_id: int, session: SessionDep) -> list[LayoutSummary]:
    return [service.summary(layout) for layout in service.list_layouts(session, design_id)]


@router.post("/designs/{design_id}/layouts", status_code=201)
def create_layout(design_id: int, data: LayoutCreate, session: SessionDep) -> LayoutDetail:
    """A stripboard is 24 strips of 37 holes unless sized; a breadboard pattern is 14 rows
    (rails, two blocks of five, rails) of 62 holes unless sized."""
    return service.detail(service.create_layout(session, design_id, data))


@router.get("/layouts/{layout_id}")
def get_layout(layout_id: int, session: SessionDep) -> LayoutDetail:
    return service.detail(service.get_layout(session, layout_id))


@router.patch("/layouts/{layout_id}")
def update_layout(layout_id: int, data: LayoutUpdate, session: SessionDep) -> LayoutDetail:
    return service.detail(service.update_layout(session, layout_id, data))


@router.delete("/layouts/{layout_id}", status_code=204)
def delete_layout(layout_id: int, session: SessionDep) -> None:
    service.delete_layout(session, layout_id)


@router.put("/layouts/{layout_id}/parts")
def place_parts(layout_id: int, data: PartsPlace, session: SessionDep) -> LayoutDetail:
    """Puts design placements on the board (their footprint's origin at strip and hole),
    moves them, or marks them off the board."""
    return service.detail(service.place_parts(session, layout_id, data.parts))


@router.delete("/layouts/{layout_id}/parts/{placement_id}")
def unplace_part(layout_id: int, placement_id: int, session: SessionDep) -> LayoutDetail:
    """Back to not placed."""
    return service.detail(service.unplace_part(session, layout_id, placement_id))


@router.post("/layouts/{layout_id}/cuts")
def add_cuts(layout_id: int, data: CutsIn, session: SessionDep) -> LayoutDetail:
    return service.detail(service.add_cuts(session, layout_id, data.cuts))


@router.delete("/layouts/{layout_id}/cuts/{cut_id}")
def remove_cut(layout_id: int, cut_id: int, session: SessionDep) -> LayoutDetail:
    return service.detail(service.remove_cut(session, layout_id, cut_id))


@router.post("/layouts/{layout_id}/parts/{placement_id}/cut-between-rows")
def cut_between_rows(layout_id: int, placement_id: int, session: SessionDep) -> LayoutDetail:
    """Cuts the strips a part spans between pins that mustn't be joined (a module's two
    header rows): at a free hole midway, or between holes when none is free."""
    return service.detail(service.cut_between_rows(session, layout_id, placement_id))


@router.post("/layouts/{layout_id}/trim")
def trim_dead_copper(layout_id: int, session: SessionDep) -> LayoutDetail:
    """Cuts each strip just past its outermost connection (between holes)."""
    return service.detail(service.trim_dead_copper(session, layout_id))


@router.post("/layouts/{layout_id}/jumpers")
def add_jumper(layout_id: int, data: JumperIn, session: SessionDep) -> LayoutDetail:
    return service.detail(service.add_jumpers(session, layout_id, [data]))


@router.patch("/layouts/{layout_id}/jumpers/{jumper_id}")
def update_jumper(
    layout_id: int, jumper_id: int, data: JumperUpdate, session: SessionDep
) -> LayoutDetail:
    return service.detail(service.update_jumper(session, layout_id, jumper_id, data))


@router.delete("/layouts/{layout_id}/jumpers/{jumper_id}")
def remove_jumper(layout_id: int, jumper_id: int, session: SessionDep) -> LayoutDetail:
    return service.detail(service.remove_jumper(session, layout_id, jumper_id))


@router.post("/layouts/{layout_id}/connectors")
def add_connector(layout_id: int, data: ConnectorIn, session: SessionDep) -> LayoutDetail:
    """A generic connector named J1, J2… unless a ref is given; pins lists the off-board
    pin each carries, `ref.PIN` or null."""
    return service.detail(service.add_connector(session, layout_id, data))


@router.patch("/layouts/{layout_id}/connectors/{connector_id}")
def update_connector(
    layout_id: int, connector_id: int, data: ConnectorUpdate, session: SessionDep
) -> LayoutDetail:
    return service.detail(service.update_connector(session, layout_id, connector_id, data))


@router.delete("/layouts/{layout_id}/connectors/{connector_id}")
def remove_connector(layout_id: int, connector_id: int, session: SessionDep) -> LayoutDetail:
    return service.detail(service.remove_connector(session, layout_id, connector_id))


@router.put("/layouts/{layout_id}/snapshot")
def apply_layout_snapshot(
    layout_id: int, data: LayoutSnapshot, session: SessionDep
) -> LayoutDetail:
    """Sets the whole layout at once: the board canvas's undo and redo."""
    return service.detail(service.apply_snapshot(session, layout_id, data))


@router.get("/layouts/{layout_id}/revisions")
def list_layout_revisions(layout_id: int, session: SessionDep) -> list[LayoutRevisionOut]:
    """Newest first: the layout as it was before the change in each summary."""
    return revisions.list_revisions(service.get_layout(session, layout_id))


@router.post("/layouts/{layout_id}/revisions/{revision_id}/restore")
def restore_layout_revision(layout_id: int, revision_id: int, session: SessionDep) -> LayoutDetail:
    return service.detail(service.restore_revision(session, layout_id, revision_id))
