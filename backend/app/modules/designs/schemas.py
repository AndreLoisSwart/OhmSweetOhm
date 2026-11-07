from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.schemas import Name, reject_null
from app.modules.designs.models import WireColor
from app.modules.parts.models import LogicVoltage, PartKind
from app.modules.parts.schemas import PinOut
from app.modules.tags.schemas import TagRef

# Safe as an identifier: wires and MCP tools say `ref.PIN`. Stored in lower case.
Ref = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z][A-Za-z0-9_]{0,19}$"
    ),
]
Rotation = Literal[0, 90, 180, 270]
# A pin on the canvas, `ref.PIN`, e.g. `esp.GPIO21`.
PinRef = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[^.\s]+\.[^.\s]+$")]
Coordinate = Annotated[int, Field(ge=-100_000, le=100_000)]


class CanvasPart(BaseModel):
    """What the canvas needs to draw a placed part."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: PartKind
    logic_voltage: LogicVoltage
    verified: bool
    pins: list[PinOut]


class PlacementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ref: str
    part_id: int
    x: int
    y: int
    rotation: Rotation
    note: str


class WireOut(BaseModel):
    id: int
    a: str
    b: str
    a_placement_id: int
    a_pin_id: int
    b_placement_id: int
    b_pin_id: int
    color: WireColor
    label: str


class NetOut(BaseModel):
    """Pins joined by wires. Computed on every read, never stored."""

    name: str
    pins: list[str]


class DesignSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    shelf_project_id: int | None
    tags: list[TagRef]
    part_count: int
    updated_at: datetime


class DesignDetail(DesignSummary):
    description_md: str
    created_at: datetime
    placements: list[PlacementOut]
    wires: list[WireOut]
    # Each part placed, once.
    parts: list[CanvasPart]
    nets: list[NetOut]


class DesignRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class DesignCreate(BaseModel):
    name: Name
    description_md: str = ""
    shelf_project_id: int | None = None
    tag_ids: list[int] = []


class DesignUpdate(BaseModel):
    """Only the fields sent are changed. shelf_project_id is cleared with null."""

    name: Name | None = None
    description_md: str | None = None
    shelf_project_id: int | None = None
    tag_ids: list[int] | None = None

    _not_null = field_validator("name", "description_md", "tag_ids")(reject_null)


class PlacementIn(BaseModel):
    part_id: int
    # Made from the part's name when left out: `bme`, then `bme2`.
    ref: Ref | None = None
    # Left out: to the right of the parts already placed.
    x: Coordinate | None = None
    y: Coordinate | None = None
    rotation: Rotation = 0
    note: str = ""


class PlacementsAdd(BaseModel):
    parts: Annotated[list[PlacementIn], Field(min_length=1, max_length=50)]


class PlacementUpdate(BaseModel):
    ref: Ref | None = None
    x: Coordinate | None = None
    y: Coordinate | None = None
    rotation: Rotation | None = None
    note: str | None = None

    _not_null = field_validator("ref", "x", "y", "rotation", "note")(reject_null)


class WireIn(BaseModel):
    a: PinRef
    b: PinRef
    # Left out: red for power, black for ground, else the next in a rotation.
    color: WireColor | None = None
    label: Annotated[str, StringConstraints(max_length=100)] = ""


class WiresAdd(BaseModel):
    wires: Annotated[list[WireIn], Field(min_length=1, max_length=200)]


class WireUpdate(BaseModel):
    color: WireColor | None = None
    label: Annotated[str, StringConstraints(max_length=100)] | None = None

    _not_null = field_validator("color", "label")(reject_null)
