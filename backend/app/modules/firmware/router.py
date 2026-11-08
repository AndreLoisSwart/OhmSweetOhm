from fastapi import APIRouter

from app.core.db import SessionDep
from app.modules.firmware import service
from app.modules.firmware.pinmap import Lang
from app.modules.firmware.schemas import BringupOut, PinMapOut

router = APIRouter(prefix="/designs/{design_id}", tags=["firmware"])


@router.get("/pinmap")
def get_pin_map(
    design_id: int, session: SessionDep, lang: Lang = Lang.C, board: str | None = None
) -> PinMapOut:
    """The design's pins for firmware: `pins.h` (lang=c) or `pins.py` (lang=py). With more
    than one board in the design, `board` is its ref."""
    return service.pin_map(session, design_id, lang, board)


@router.get("/bringup")
def get_bringup_sketch(design_id: int, session: SessionDep, board: str | None = None) -> BringupOut:
    """An Arduino sketch that checks the built circuit against the design, with the
    pins.h it includes. With more than one board in the design, `board` is its ref."""
    return service.bringup_sketch(session, design_id, board)
