from pydantic import BaseModel

from app.modules.firmware.pinmap import Lang


class PinMapOut(BaseModel):
    lang: Lang
    filename: str
    # The board the map is for, and every board in the design to choose from.
    board: str
    boards: list[str]
    text: str


class FirmwareFile(BaseModel):
    filename: str
    text: str


class BringupOut(BaseModel):
    # The board the sketch is for, and every board in the design to choose from.
    board: str
    boards: list[str]
    # The sketch first, then the pins.h it includes.
    files: list[FirmwareFile]
