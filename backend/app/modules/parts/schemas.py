from datetime import datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.core.schemas import Name, reject_null
from app.modules.parts.models import (
    Author,
    LogicVoltage,
    PartKind,
    PinFlag,
    PinKind,
    PinSide,
    Platform,
)
from app.modules.tags.schemas import TagRef

# No spaces or dots: pins are named `ref.PIN` in wires and MCP tools.
PinName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40, pattern=r"^[^\s.]+$")
]
Volts = Annotated[float, Field(gt=0, le=60)]
I2CAddress = Annotated[int, Field(ge=0, le=0x7F)]
# A number or an identifier, as an Arduino or MicroPython pin is named. Blank clears it.
CodeName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=20, pattern=r"^([A-Za-z0-9_]+)?$"),
]


# A PlatformIO library: `owner/Name@^1.2`, or just a name. One line, no list separators.
LibrarySpec = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200, pattern=r"^[^\n\r,;]+$"),
]
# A PlatformIO board id, e.g. esp32dev or nanoatmega328. Blank clears it.
PlatformioBoard = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=60, pattern=r"^[A-Za-z0-9_.-]*$")
]


class PartLibrary(BaseModel):
    """A library firmware for the part needs, on the platforms listed (empty: all)."""

    spec: LibrarySpec
    platforms: list[Platform] = []

    @field_validator("platforms")
    @classmethod
    def _unique_platforms(cls, value: list[Platform]) -> list[Platform]:
        return list(dict.fromkeys(value))


def _unique_libraries(libraries: list[PartLibrary] | None) -> list[PartLibrary] | None:
    if libraries is None:
        return None
    seen: dict[str, PartLibrary] = {}
    for library in libraries:
        seen.setdefault(library.spec.lower(), library)
    return list(seen.values())


def _unique(values: list) -> list:
    return list(dict.fromkeys(values))


def _clean_url(url: str | None) -> str | None:
    if url is None:
        return None
    url = url.strip()
    if url and not url.lower().startswith(("http://", "https://")):
        raise ValueError("must start with http:// or https://")
    return url


def _clean_optional(text: str | None) -> str | None:
    return (text or "").strip() or None


class PinIn(BaseModel):
    """A pin as sent by the pin editor. Its position comes from its place in the list."""

    # Set for an existing pin, so wires to it survive renames. Left out for a new pin.
    id: int | None = None
    name: PinName
    kind: PinKind
    functions: list[PinKind] = []
    voltage: Volts | None = None
    flags: list[PinFlag] = []
    side: PinSide
    wokwi_name: Annotated[str, StringConstraints(max_length=40)] | None = None
    # Pins of this part with the same tie are joined inside it, e.g. two 3V3 pins both
    # tied "3V3". Ground pins are joined anyway.
    tie: Annotated[str, StringConstraints(max_length=20)] | None = None
    # What firmware calls the pin, e.g. `21` or `A0`. Only where the name rule is wrong:
    # GPIO21 → 21, D2 → 2, A0 → A0.
    code_name: CodeName | None = None

    _unique_lists = field_validator("functions", "flags")(_unique)
    _optional = field_validator("wokwi_name", "tie", "code_name")(_clean_optional)


def check_pin_names(pins: list[PinIn]) -> list[PinIn]:
    seen: set[str] = set()
    for pin in pins:
        if pin.name.lower() in seen:
            raise ValueError(f'Two pins are called "{pin.name}". Number repeats, e.g. GND and GND2')
        seen.add(pin.name.lower())
    return pins


class PinsReplace(BaseModel):
    """The part's whole pin list, in order: each side's pins top to bottom or left to right."""

    pins: list[PinIn]

    _names = field_validator("pins")(check_pin_names)


class PinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: PinKind
    functions: list[PinKind]
    voltage: float | None
    flags: list[PinFlag]
    side: PinSide
    position: int
    wokwi_name: str | None
    tie: str | None
    code_name: str | None
    # What the name rule gives when code_name is empty.
    default_code_name: str | None


class PartSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: PartKind
    logic_voltage: LogicVoltage
    verified: bool
    shelf_item_id: int | None
    tags: list[TagRef]
    pin_count: int
    updated_at: datetime


class PartDetail(PartSummary):
    description: str
    supply_min_v: float | None
    supply_max_v: float | None
    i2c_addresses: list[int]
    datasheet_url: str
    notes_md: str
    created_by: Author
    wokwi_type: str | None
    platform: Platform | None
    platformio_board: str | None
    libraries: list[PartLibrary]
    created_at: datetime
    # Left side first, then right, top and bottom; each in header order.
    pins: list[PinOut]
    # Designs the part is placed in.
    used_in: list["DesignRef"] = []


class DesignRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class _PartFields(BaseModel):
    @model_validator(mode="after")
    def _supply_range(self):
        low, high = getattr(self, "supply_min_v", None), getattr(self, "supply_max_v", None)
        if low is not None and high is not None and low > high:
            raise ValueError("The lowest supply voltage is above the highest")
        return self


class PartCreate(_PartFields):
    name: Name
    kind: PartKind
    logic_voltage: LogicVoltage = LogicVoltage.V3V3
    description: str = ""
    supply_min_v: Volts | None = None
    supply_max_v: Volts | None = None
    i2c_addresses: list[I2CAddress] = []
    datasheet_url: str = ""
    notes_md: str = ""
    shelf_item_id: int | None = None
    wokwi_type: str | None = None
    platform: Platform | None = None
    platformio_board: PlatformioBoard | None = None
    libraries: list[PartLibrary] = []
    tag_ids: list[int] = []
    pins: list[PinIn] = []

    _unique_lists = field_validator("i2c_addresses")(_unique)
    _url = field_validator("datasheet_url")(_clean_url)
    _optional = field_validator("wokwi_type", "platformio_board")(_clean_optional)
    _libraries = field_validator("libraries")(_unique_libraries)
    _names = field_validator("pins")(check_pin_names)


class PartUpdate(_PartFields):
    """Only the fields sent are changed. Nullable fields are cleared with null."""

    name: Name | None = None
    kind: PartKind | None = None
    logic_voltage: LogicVoltage | None = None
    description: str | None = None
    supply_min_v: Volts | None = None
    supply_max_v: Volts | None = None
    i2c_addresses: list[I2CAddress] | None = None
    datasheet_url: str | None = None
    notes_md: str | None = None
    verified: bool | None = None
    shelf_item_id: int | None = None
    wokwi_type: str | None = None
    platform: Platform | None = None
    platformio_board: PlatformioBoard | None = None
    libraries: list[PartLibrary] | None = None
    tag_ids: list[int] | None = None

    _not_null = field_validator(
        "name",
        "kind",
        "logic_voltage",
        "description",
        "i2c_addresses",
        "datasheet_url",
        "notes_md",
        "verified",
        "tag_ids",
        "libraries",
    )(reject_null)
    _unique_lists = field_validator("i2c_addresses")(lambda v: _unique(v) if v else v)
    _url = field_validator("datasheet_url")(_clean_url)
    _optional = field_validator("wokwi_type", "platformio_board")(_clean_optional)
    _libraries = field_validator("libraries")(_unique_libraries)


class StarterPartOut(BaseModel):
    name: str
    kind: PartKind
    pin_count: int
    # Already in the library (by name, ignoring case).
    present: bool


class StarterAdded(BaseModel):
    added: list[str]
    skipped: list[str]
    # Already in the library, with empty firmware fields (platform, PlatformIO board,
    # libraries) filled in from the starter data.
    updated: list[str] = []
