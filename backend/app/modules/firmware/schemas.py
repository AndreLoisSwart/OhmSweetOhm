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


class FirmwareFiles(BaseModel):
    """Generated files for one board: the bring-up sketch with its pins.h, or the
    PlatformIO project file."""

    # The board they're for, and every board in the design to choose from.
    board: str
    boards: list[str]
    files: list[FirmwareFile]


class PinMapCompare(BaseModel):
    """A firmware's pins.h or pins.py, to compare with the design as it is now."""

    text: str
    # Left out: worked out from the text (constexpr or #define means pins.h).
    lang: Lang | None = None
    board: str | None = None


class ConstantOut(BaseModel):
    name: str
    value: str
    # The pin it's on, and any warning about it (e.g. `esp.GPIO21`, a strapping pin).
    comment: str = ""


class ConstantChange(BaseModel):
    name: str
    in_file: str
    in_design: str
    comment: str = ""


class PinMapDrift(BaseModel):
    up_to_date: bool
    # Same name, different value: the wiring moved.
    changed: list[ConstantChange]
    # In the design but not the file: newly wired.
    added: list[ConstantOut]
    # In the file but no longer in the design: unwired or renamed.
    removed: list[ConstantOut]
    # The pin map as the design is now, to replace the file with.
    pin_map: PinMapOut
