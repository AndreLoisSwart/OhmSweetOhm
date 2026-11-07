from fastapi import APIRouter

from app.core.db import SessionDep
from app.modules.firmware import service
from app.modules.firmware.pinmap import Lang
from app.modules.firmware.schemas import PinMapOut

router = APIRouter(prefix="/designs/{design_id}", tags=["firmware"])


@router.get("/pinmap")
def get_pin_map(
    design_id: int, session: SessionDep, lang: Lang = Lang.C, board: str | None = None
) -> PinMapOut:
    """The design's pins for firmware: `pins.h` (lang=c) or `pins.py` (lang=py). With more
    than one board in the design, `board` is its ref."""
    return service.pin_map(session, design_id, lang, board)
