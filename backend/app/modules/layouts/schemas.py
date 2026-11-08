from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.core.schemas import Name, reject_null
from app.modules.checks.schemas import CheckSummary, Severity
from app.modules.designs.models import WireColor
from app.modules.designs.schemas import PinRef, Rotation
from app.modules.layouts.models import BoardType, ConnectorType, JumperSide, Mount
from app.modules.parts.models import Author

# A position on the board, from 1. Generous bounds: a part may be dragged past the edge
# (the checks say so), but not to anywhere at all.
Position = Annotated[int, Field(ge=-100, le=300)]
ConnectorRef = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z][A-Za-z0-9_]{0,19}$")
]

# Board sizes: the user's stripboard and full-size breadboard-pattern board.
DEFAULT_SIZE = {BoardType.STRIPBOARD: (24, 37), BoardType.BREADBOARD: (14, 62)}


class LayoutCreate(BaseModel):
    name: Name
    board_type: BoardType = BoardType.STRIPBOARD
    # Strips (rows, lettered) and holes along each. A breadboard pattern has 14 rows.
    strips: Annotated[int, Field(ge=2, le=100)] | None = None
    holes: Annotated[int, Field(ge=2, le=200)] | None = None


class LayoutUpdate(BaseModel):
    name: Name | None = None
    notes: str | None = None

    _not_null = field_validator("name", "notes")(reject_null)


class PartPlace(BaseModel):
    """A design placement on the board (strip and hole of its footprint's origin), or
    off it. The mount defaults to socketed for boards, soldered for everything else."""

    placement_id: int
    on_board: bool = True
    strip: Position | None = None
    hole: Position | None = None
    rotation: Rotation | None = None
    mount: Mount | None = None

    @model_validator(mode="after")
    def _position(self):
        if self.on_board and (self.strip is None or self.hole is None):
            raise ValueError("A part on the board needs a strip and a hole")
        return self


class PartsPlace(BaseModel):
    parts: Annotated[list[PartPlace], Field(min_length=1, max_length=50)]


class CutIn(BaseModel):
    strip: Position
    hole: Position
    # False: at the hole (its copper removed); true: between it and the next hole.
    between: bool = False


class CutsIn(BaseModel):
    cuts: Annotated[list[CutIn], Field(min_length=1, max_length=200)]


class JumperIn(BaseModel):
    a_strip: Position
    a_hole: Position
    b_strip: Position
    b_hole: Position
    side: JumperSide = JumperSide.TOP
    insulated: bool = False
    color: WireColor | None = None


class JumperUpdate(BaseModel):
    a_strip: Position | None = None
    a_hole: Position | None = None
    b_strip: Position | None = None
    b_hole: Position | None = None
    side: JumperSide | None = None
    insulated: bool | None = None
    color: WireColor | None = None


class ConnectorIn(BaseModel):
    """Pins are what each connector pin carries, in order: an off-board part's pin as
    `ref.PIN`, or null for none."""

    type: ConnectorType = ConnectorType.HEADER_FEMALE
    pin_count: Annotated[int, Field(ge=1, le=40)]
    ref: ConnectorRef | None = None
    strip: Position | None = None
    hole: Position | None = None
    rotation: Rotation = 0
    pins: list[PinRef | None] = []


class ConnectorUpdate(BaseModel):
    """Only what's sent changes. strip and hole null take it off the board; pins is the
    whole list."""

    type: ConnectorType | None = None
    pin_count: Annotated[int, Field(ge=1, le=40)] | None = None
    ref: ConnectorRef | None = None
    strip: Position | None = None
    hole: Position | None = None
    rotation: Rotation | None = None
    pins: list[PinRef | None] | None = None


# Snapshots, for undo and revisions ------------------------------------------------------


class PartSnapshot(BaseModel):
    placement_id: int
    ref: str
    on_board: bool
    strip: int | None
    hole: int | None
    rotation: int
    mount: Mount
    footprint_sig: str = ""


class CutSnapshot(BaseModel):
    strip: int
    hole: int
    between: bool


class JumperSnapshot(BaseModel):
    a_strip: int
    a_hole: int
    b_strip: int
    b_hole: int
    side: JumperSide
    insulated: bool
    color: WireColor


class ConnectorPinSnapshot(BaseModel):
    index: int
    placement_id: int | None
    pin_id: int | None


class ConnectorSnapshot(BaseModel):
    ref: str
    type: ConnectorType
    pin_count: int
    strip: int | None
    hole: int | None
    rotation: int
    pins: list[ConnectorPinSnapshot]


class LayoutSnapshot(BaseModel):
    parts: list[PartSnapshot] = []
    cuts: list[CutSnapshot] = []
    jumpers: list[JumperSnapshot] = []
    connectors: list[ConnectorSnapshot] = []


# Answers -------------------------------------------------------------------------------


class BoardPinOut(BaseModel):
    key: str  # `ref.PIN`
    strip: int
    hole: int
    at: str  # e.g. C14


class BodyOut(BaseModel):
    """The outline in board steps (fractional): strips and holes it spans."""

    strip0: float
    hole0: float
    strip1: float
    hole1: float


class LayoutPartOut(BaseModel):
    placement_id: int
    ref: str
    part_id: int
    part_name: str
    on_board: bool
    strip: int | None
    hole: int | None
    at: str | None
    rotation: int
    mount: Mount
    # The footprint it was placed with (sent back in snapshots for undo).
    footprint_sig: str
    pins: list[BoardPinOut]
    body: BodyOut | None


class UnplacedOut(BaseModel):
    placement_id: int
    ref: str
    part_id: int
    part_name: str
    # Whether every pin (not NC) has a hole: only then can it go on the board.
    has_footprint: bool


class CutOut(BaseModel):
    id: int
    strip: int
    hole: int
    between: bool
    at: str


class JumperOut(BaseModel):
    id: int
    a_strip: int
    a_hole: int
    b_strip: int
    b_hole: int
    a: str
    b: str
    side: JumperSide
    insulated: bool
    color: WireColor
    # In holes.
    length: float


class ConnectorPinOut(BaseModel):
    index: int
    # The off-board pin it carries, `ref.PIN`, or null, and its ids.
    pin: str | None
    placement_id: int | None
    pin_id: int | None
    strip: int | None
    hole: int | None


class ConnectorOut(BaseModel):
    id: int
    ref: str
    type: ConnectorType
    pin_count: int
    strip: int | None
    hole: int | None
    at: str | None
    rotation: int
    pins: list[ConnectorPinOut]


class SegmentOut(BaseModel):
    """A straight run of joined copper and the design nets it carries."""

    a_strip: int
    a_hole: int
    b_strip: int
    b_hole: int
    nets: list[str]
    # It joins pins the design keeps apart (unwired pins count): drawn as a short.
    short: bool


class LinkOut(BaseModel):
    """A connection the board doesn't make yet: the ratsnest."""

    net: str
    a: str
    b: str
    a_strip: int
    a_hole: int
    b_strip: int
    b_hole: int


class LayoutCheck(BaseModel):
    id: str
    severity: Severity
    message: str
    pins: list[str]
    # Holes it's about, e.g. C14.
    holes: list[str]
    net: str | None = None


class LayoutStats(BaseModel):
    on_board: int
    off_board: int
    not_placed: int
    missing: int
    cuts: int
    jumpers: int
    jumper_length: float
    area_strips: int
    area_holes: int


class PlacedRef(BaseModel):
    """Where one of the design's placements is in a layout, for the schematic."""

    placement_id: int
    on_board: bool
    at: str | None


class LayoutSummary(BaseModel):
    id: int
    design_id: int
    name: str
    board_type: BoardType
    strips: int
    holes: int
    updated_at: datetime
    check_summary: CheckSummary
    stats: LayoutStats
    placed: list[PlacedRef]


class LayoutDetail(LayoutSummary):
    notes: str
    created_at: datetime
    parts: list[LayoutPartOut]
    not_placed: list[UnplacedOut]
    cuts: list[CutOut]
    jumpers: list[JumperOut]
    connectors: list[ConnectorOut]
    segments: list[SegmentOut]
    links: list[LinkOut]
    checks: list[LayoutCheck]


class LayoutRevisionOut(BaseModel):
    id: int
    created_at: datetime
    author: Author
    summary: str
