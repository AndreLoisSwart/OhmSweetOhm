from fastapi import APIRouter

from app.core.db import SessionDep
from app.modules.firmware import service
from app.modules.firmware.pinmap import Lang
from app.modules.firmware.schemas import (
    FirmwareFiles,
    PinMapCompare,
    PinMapDrift,
    PinMapOut,
    WokwiExport,
)

router = APIRouter(prefix="/designs/{design_id}", tags=["firmware"])


@router.get("/pinmap")
def get_pin_map(
    design_id: int, session: SessionDep, lang: Lang = Lang.C, board: str | None = None
) -> PinMapOut:
    """The design's pins for firmware: `pins.h` (lang=c) or `pins.py` (lang=py). With more
    than one board in the design, `board` is its ref."""
    return service.pin_map(session, design_id, lang, board)


@router.get("/bringup")
def get_bringup_sketch(
    design_id: int, session: SessionDep, board: str | None = None
) -> FirmwareFiles:
    """An Arduino sketch that checks the built circuit against the design, with the
    pins.h it includes. With more than one board in the design, `board` is its ref."""
    return service.bringup_sketch(session, design_id, board)


@router.get("/platformio")
def get_platformio_project(
    design_id: int, session: SessionDep, board: str | None = None
) -> FirmwareFiles:
    """platformio.ini for the board: its platform and board id, and the libraries the
    design's parts need on that platform. With more than one board, `board` is its ref."""
    return service.platformio_project(session, design_id, board)


@router.get("/wokwi")
def get_wokwi_export(design_id: int, session: SessionDep, board: str | None = None) -> WokwiExport:
    """The design as Wokwi's diagram.json, with a wokwi.toml for the board's PlatformIO
    build. Parts without a Wokwi type are left out with their wires, and listed."""
    return service.wokwi_export(session, design_id, board)


@router.post("/pinmap/compare")
def compare_pin_map(design_id: int, data: PinMapCompare, session: SessionDep) -> PinMapDrift:
    """How a firmware's pins.h or pins.py differs from the design as it is now: constants
    whose pin changed, newly wired ones, and ones no longer in the design. Read-only."""
    return service.compare_pin_map(session, design_id, data)
