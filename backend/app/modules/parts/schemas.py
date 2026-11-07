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
from app.modules.parts.models import Author, LogicVoltage, PartKind, PinFlag, PinKind, PinSide
from app.modules.tags.schemas import TagRef

# No spaces or dots: pins are named `ref.PIN` in wires and MCP tools.
PinName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40, pattern=r"^[^\s.]+$")
]
Volts = Annotated[float, Field(gt=0, le=60)]
I2CAddress = Annotated[int, Field(ge=0, le=0x7F)]


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

    _unique_lists = field_validator("functions", "flags")(_unique)
    _optional = field_validator("wokwi_name", "tie")(_clean_optional)


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
    tag_ids: list[int] = []
    pins: list[PinIn] = []

    _unique_lists = field_validator("i2c_addresses")(_unique)
    _url = field_validator("datasheet_url")(_clean_url)
    _optional = field_validator("wokwi_type")(_clean_optional)
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
    )(reject_null)
    _unique_lists = field_validator("i2c_addresses")(lambda v: _unique(v) if v else v)
    _url = field_validator("datasheet_url")(_clean_url)
    _optional = field_validator("wokwi_type")(_clean_optional)


class StarterPartOut(BaseModel):
    name: str
    kind: PartKind
    pin_count: int
    # Already in the library (by name, ignoring case).
    present: bool


class StarterAdded(BaseModel):
    added: list[str]
    skipped: list[str]
