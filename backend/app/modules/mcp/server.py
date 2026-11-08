"""The MCP server: Ohm Sweet Ohm's tools for Claude (docs/mcp.md).

Tools call the same service functions as the REST API, so every rule applies and Claude
sees what the app shows. On top of those, for Claude:
- Nothing is deleted: no parts, pins, designs, tags or revisions. Inside a design,
  placements and wires can be removed, since every change saves a revision first.
- Free text is append-only: part notes and design descriptions are added to.
- Parts Claude creates start unverified, and so does any part whose pins Claude changes.
- None means "leave unchanged": fields can't be cleared through these tools.
"""

import functools
import inspect
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime
from typing import Annotated

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.checks.schemas import CheckSummary, DesignChecks
from app.modules.checks.service import run_checks
from app.modules.designs import revisions as revisions_service
from app.modules.designs import service as designs
from app.modules.designs.models import Design, WireColor
from app.modules.designs.schemas import (
    DesignCreate,
    DesignSummary,
    DesignUpdate,
    NetOut,
    PinRef,
    PlacementIn,
    PlacementUpdate,
    Ref,
    RevisionOut,
    Rotation,
    SuggestedWiring,
    WireIn,
    WireUpdate,
)
from app.modules.firmware import service as firmware
from app.modules.firmware.pinmap import Lang
from app.modules.firmware.schemas import (
    FirmwareFiles,
    PinMapCompare,
    PinMapDrift,
    PinMapOut,
    WokwiExport,
)
from app.modules.parts import service as part_service
from app.modules.parts.models import Author, LogicVoltage, PartKind, Platform
from app.modules.parts.router import part_detail
from app.modules.parts.schemas import (
    BodyMm,
    FootprintIn,
    Hole,
    PartCreate,
    PartDetail,
    PartLibrary,
    PartSummary,
    PartUpdate,
    PinIn,
)
from app.modules.tags import service as tags
from app.modules.tags.schemas import TagCreate, TagOut, TagRef

INSTRUCTIONS = """\
Ohm Sweet Ohm is the user's electronics workbench: a library of off-the-shelf modules
(parts with pins) and designs (wiring diagrams of placed parts and pin-to-pin wires).
Shelf-help, a separate server, holds stock (have/low/out/need) and projects; parts and
designs carry Shelf-help ids (shelf_item_id, shelf_project_id).

- Refer to pins as `ref.PIN`, e.g. `esp.GPIO21`. Use the exact pin names from get_part.
- Run check_design after changing a design, and fix the errors or explain them.
- Parts you create are unverified. Take pinouts from the datasheet or the maker's page,
  say where they came from in the part's notes (append_part_notes), and ask the user to
  check them. Changing a part's pins makes it unverified again.
- Search before creating a part. When adding one, also find or create its Shelf-help
  item and store the id.
- This app can't see Shelf-help, so it can't check Shelf-help ids: look each one up with
  the Shelf-help tools before storing it. 0 unlinks.
- Ground pins of a part are joined inside it, and so are pins sharing a tie (two 3V3 pins
  tied "3V3"); nets include them. Set tie when creating parts with repeated supply pins.
- Footprints are in mm: each pin's hole (x_mm, y_mm) from the part's origin, usually
  its first pin, top view with x right and y down, and body_mm the outline it covers.
  Take them from the maker's drawing, and say so in the notes. For header modules use
  set_footprint with from_sides (the gap between the header rows, pitch 2.54), then
  set the real body_mm. Most modules' holes are multiples of 2.54 mm apart.
- Writing firmware for a design (not ESPHome): get_pin_map and save it in the firmware
  as pins.h or pins.py, then use its constants, never bare pin numbers. If a board pin
  has no code name, say so rather than guessing. Store where the firmware lives as the
  design's firmware_repo. To check a newly built circuit, offer get_bringup_sketch
  before writing the real firmware. Start a PlatformIO project from
  get_platformio_project. When a part needs a library it doesn't list, add it to the
  part (update_part libraries) so the next design gets it too.
- Adding a part to a design: place it, run suggest_wiring for it, show the user the
  proposed wires (with any warnings), then connect the ones they agree to.
- To simulate a design, use get_wokwi_export: save diagram.json and wokwi.toml next to
  platformio.ini. A part with no wokwi_type is left out; if Wokwi has that part, set
  wokwi_type (and wokwi_name on pins Wokwi names differently) with update_part.
- Before changing pin-related code in a firmware with a generated pins.h or pins.py
  (its header names the design id), run compare_pin_map with the file's text. If the
  design has moved on, tell the user what changed, replace the file with the new one,
  and update code that used changed or removed constants.
- Part kind actuator means the board drives it (LED, relay, buzzer, servo); buttons and
  switches are inputs, never actuators (the bring-up sketch drives actuator pins).
- "Do I have what this design needs?": look up each part's Shelf-help item. Offer to mark
  missing ones as need.
- Every change you make to a design saves a revision first, so the user can undo it from
  History in the app. Nothing can be deleted through these tools (parts, pins, designs,
  tags); ask the user to do that in the app. Notes and descriptions can only be added to.
"""

READ = ToolAnnotations(readOnlyHint=True)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=False)
# Removing a placement or wire inside a design: undoable, but it does remove something.
REMOVE = ToolAnnotations(readOnlyHint=False, destructiveHint=True)

SessionOpener = Callable[[], AbstractContextManager[Session]]


class PinHole(BaseModel):
    """A pin's hole in a footprint, by the pin's name, in mm from the part's origin."""

    pin: str
    x_mm: float
    y_mm: float


class FromSides(BaseModel):
    """Lay the holes out from the pins' sides: left and right pins as columns span_mm
    apart (top and bottom pins as rows), pitch_mm between neighbours."""

    span_mm: float | None = None
    pitch_mm: float = 2.54


class PlacedPart(BaseModel):
    ref: str
    part_id: int
    part_name: str
    verified: bool
    x: int
    y: int
    rotation: int
    note: str


class WireView(BaseModel):
    a: str
    b: str
    color: WireColor
    label: str


class DesignView(BaseModel):
    """A design as a netlist: its parts, wires and computed nets, and its check counts."""

    id: int
    name: str
    description_md: str
    shelf_project_id: int | None
    firmware_repo: str | None
    tags: list[TagRef]
    updated_at: datetime
    parts: list[PlacedPart]
    wires: list[WireView]
    nets: list[NetOut]
    check_summary: CheckSummary


# Lists come wrapped in an object, so an empty list and a full one look the same to the
# client (bare lists are sent as one content block per item, or none).


class PartsFound(BaseModel):
    parts: list[PartSummary]


class Tags(BaseModel):
    tags: list[TagOut]


class Designs(BaseModel):
    designs: list[DesignSummary]


class Revisions(BaseModel):
    revisions: list[RevisionOut]


def inline_schema(schema: dict) -> dict:
    """The schema with `$defs` written out where they're used, and `X | None` fields
    shown as plain X (they're optional by not being required).

    Some MCP clients drop `$defs`, leaving fields that point at nothing: no pin fields, no
    allowed values. Written out in place, every client sees them.
    """
    defs = schema.get("$defs", {})

    def walk(node):
        if isinstance(node, list):
            return [walk(item) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            target = walk(defs[node["$ref"].rsplit("/", 1)[-1]])
            extra = {k: walk(v) for k, v in node.items() if k != "$ref"}
            return {**target, **extra}
        node = {k: walk(v) for k, v in node.items() if k != "$defs"}
        options = node.get("anyOf")
        if options and len(options) == 2 and {"type": "null"} in options:
            kept = next(o for o in options if o != {"type": "null"})
            node = {**{k: v for k, v in node.items() if k != "anyOf"}, **kept}
        return node

    return walk(schema)


def _view(design: Design) -> DesignView:
    detail = designs.detail(design)
    names = {p.id: p for p in detail.parts}
    return DesignView(
        id=detail.id,
        name=detail.name,
        description_md=detail.description_md,
        shelf_project_id=detail.shelf_project_id,
        firmware_repo=detail.firmware_repo,
        tags=detail.tags,
        updated_at=detail.updated_at,
        parts=[
            PlacedPart(
                ref=p.ref,
                part_id=p.part_id,
                part_name=names[p.part_id].name,
                verified=names[p.part_id].verified,
                x=p.x,
                y=p.y,
                rotation=p.rotation,
                note=p.note,
            )
            for p in detail.placements
        ],
        wires=[WireView(a=w.a, b=w.b, color=w.color, label=w.label) for w in detail.wires],
        nets=detail.nets,
        check_summary=detail.check_summary,
    )


def _part_detail(session: Session, part_id: int) -> PartDetail:
    return part_detail(session, part_service.get_part(session, part_id))


def _explained(fn):
    """Lets the model read why a call was refused (a missing record, a broken rule,
    an invalid value). The SDK hides the text of other exceptions, as crashes."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (NotFoundError, ConflictError) as e:
            raise ToolError(str(e)) from e
        except ValidationError as e:
            problems = "; ".join(
                f"{'.'.join(map(str, err['loc']))}: {err['msg'].removeprefix('Value error, ')}"
                for err in e.errors()
            )
            raise ToolError(problems) from e

    return wrapper


def _set(**fields) -> dict:
    """Only the fields given, for partial updates. A Shelf-help id of 0 unlinks it."""
    given = {name: value for name, value in fields.items() if value is not None}
    for link in ("shelf_item_id", "shelf_project_id"):
        if given.get(link) == 0:
            given[link] = None
    return given


def _placement_summary(
    ref: str, new_ref: str | None, moved: bool, rotated: bool, noted: bool
) -> str:
    """e.g. "Moved and rotated esp", "Renamed bme to sensor", "Moved bme (now sensor)"."""
    verbs = [v for v, done in (("moved", moved), ("rotated", rotated)) if done]
    if noted:
        verbs.append("changed the note of")
    if not verbs:
        return f"Renamed {ref} to {new_ref}" if new_ref else f"Changed {ref}"
    text = " and ".join([", ".join(verbs[:-1]), verbs[-1]] if len(verbs) > 1 else verbs)
    renamed = f" (now {new_ref})" if new_ref else ""
    return f"{text[0].upper()}{text[1:]} {ref}{renamed}"


def _listed(items: list[str], limit: int = 3) -> str:
    shown = ", ".join(items[:limit])
    return shown if len(items) <= limit else f"{shown} and {len(items) - limit} more"


def build_server(open_session: SessionOpener) -> MCPServer:
    server = MCPServer(name="Ohm Sweet Ohm", instructions=INSTRUCTIONS)

    def tool(annotations: ToolAnnotations):
        """Registers a tool, its docstring (without code indentation) as the description."""

        def register(fn):
            description = inspect.cleandoc(fn.__doc__ or "")
            return server.tool(description=description, annotations=annotations)(_explained(fn))

        return register

    # --- Library ---

    @tool(READ)
    def search_parts(
        query: Annotated[str, Field(max_length=200)] | None = None,
        kind: PartKind | None = None,
        tag_id: int | None = None,
        unverified_only: bool = False,
    ) -> PartsFound:
        """Parts in the library, by name. query matches names and descriptions."""
        with open_session() as session:
            found = part_service.list_parts(
                session,
                query,
                [kind] if kind else None,
                [tag_id] if tag_id is not None else None,
                False if unverified_only else None,
            )
            return PartsFound(parts=[PartSummary.model_validate(p) for p in found])

    @tool(READ)
    def get_part(part_id: int) -> PartDetail:
        """A part with every pin (id, kind, alternate functions, voltage, flags, side and
        position in header order), and the designs it's placed in."""
        with open_session() as session:
            return _part_detail(session, part_id)

    @tool(WRITE)
    def create_part(
        name: str,
        kind: PartKind,
        pins: list[PinIn],
        logic_voltage: LogicVoltage = LogicVoltage.V3V3,
        description: str = "",
        supply_min_v: float | None = None,
        supply_max_v: float | None = None,
        i2c_addresses: list[int] | None = None,
        datasheet_url: str = "",
        notes_md: str = "",
        shelf_item_id: int | None = None,
        wokwi_type: str | None = None,
        platform: Platform | None = None,
        platformio_board: str | None = None,
        libraries: list[PartLibrary] | None = None,
        tag_ids: list[int] | None = None,
        body_mm: BodyMm | None = None,
    ) -> PartDetail:
        """Creates a part with its pins. It starts unverified, for the user to check.
        Pins go in header order per side (left and right top to bottom, top and bottom
        left to right); names are unique and have no spaces or dots (number repeats: GND,
        GND2). Name board pins by the chip's GPIO (GPIO21), not the silkscreen (D21).
        A pin's kind is its main role; functions lists alternates (GPIO21: gpio with
        functions ["i2c_sda"]). voltage: what a power pin supplies or needs, or the most a
        signal pin accepts. i2c_addresses: 7-bit, the default first. Say where the pinout
        came from in notes_md. Boards: platform and platformio_board (PlatformIO's board
        id, e.g. esp32dev). libraries: what firmware for the part needs, as PlatformIO
        specs (`owner/Name@^major.minor`), each limited to some platforms when it only
        works there (e.g. ESP32Servo on espressif32). Footprint: x_mm and y_mm on each
        pin and body_mm, or set it afterwards with set_footprint."""
        data = PartCreate(
            name=name,
            kind=kind,
            pins=pins,
            logic_voltage=logic_voltage,
            description=description,
            supply_min_v=supply_min_v,
            supply_max_v=supply_max_v,
            i2c_addresses=i2c_addresses or [],
            datasheet_url=datasheet_url,
            notes_md=notes_md,
            shelf_item_id=shelf_item_id,
            wokwi_type=wokwi_type,
            platform=platform,
            platformio_board=platformio_board,
            libraries=libraries or [],
            tag_ids=tag_ids or [],
            body_mm=body_mm,
        )
        with open_session() as session:
            part = part_service.create_part(session, data, Author.CLAUDE)
            return _part_detail(session, part.id)

    @tool(WRITE)
    def update_part(
        part_id: int,
        name: str | None = None,
        kind: PartKind | None = None,
        logic_voltage: LogicVoltage | None = None,
        description: str | None = None,
        supply_min_v: float | None = None,
        supply_max_v: float | None = None,
        i2c_addresses: list[int] | None = None,
        datasheet_url: str | None = None,
        shelf_item_id: int | None = None,
        wokwi_type: str | None = None,
        platform: Platform | None = None,
        platformio_board: str | None = None,
        libraries: list[PartLibrary] | None = None,
        tag_ids: list[int] | None = None,
        pins: list[PinIn] | None = None,
    ) -> PartDetail:
        """Changes the fields given. pins, when given, is the whole pin list in header
        order: send every existing pin with its id (from get_part), changed or not, plus
        new ones without an id. That adds, renames and reorders pins; removing one isn't
        possible here. Changing the pins, platform, platformio_board or libraries
        sets the part unverified. libraries, when given, is the whole list. Notes are added with
        append_part_notes. shelf_item_id: 0 unlinks; look the id up in Shelf-help before
        storing it, since this app can't check it."""
        fields = _set(
            name=name,
            kind=kind,
            logic_voltage=logic_voltage,
            description=description,
            supply_min_v=supply_min_v,
            supply_max_v=supply_max_v,
            i2c_addresses=i2c_addresses,
            datasheet_url=datasheet_url,
            shelf_item_id=shelf_item_id,
            wokwi_type=wokwi_type,
            platform=platform,
            platformio_board=platformio_board,
            libraries=libraries,
            tag_ids=tag_ids,
        )
        with open_session() as session:
            if fields:
                part_service.update_part(session, part_id, PartUpdate(**fields), Author.CLAUDE)
            if pins is not None:
                part_service.replace_pins(session, part_id, pins, Author.CLAUDE)
            return _part_detail(session, part_id)

    @tool(WRITE)
    def set_footprint(
        part_id: int,
        holes: list[PinHole] | None = None,
        from_sides: FromSides | None = None,
        body_mm: BodyMm | None = None,
    ) -> PartDetail:
        """Sets the part's whole footprint, in mm from its origin (top view, x right, y
        down). Give either holes (every pin that goes through the board; pins left out
        get none) or from_sides (header modules: holes laid out from the pins' sides).
        body_mm is the outline the part covers; without it, from_sides keeps the body the
        part has, or makes one just around the pins. Sets the part unverified."""
        if (holes is None) == (from_sides is None):
            raise ConflictError("Give either holes or from_sides")
        with open_session() as session:
            part = part_service.get_part(session, part_id)
            if from_sides is not None:
                made = part_service.footprint_from_sides(
                    session, part_id, from_sides.span_mm, from_sides.pitch_mm
                )
                given = [Hole(pin_id=h.pin_id, x_mm=h.x_mm, y_mm=h.y_mm) for h in made.holes]
                body = body_mm or part.body_mm or made.body_mm
            else:
                by_name = {pin.name.lower(): pin for pin in part.pins}
                given = []
                for hole in holes:
                    pin = by_name.get(hole.pin.lower())
                    if pin is None:
                        raise NotFoundError(f'{part.name} has no pin "{hole.pin}"')
                    given.append(Hole(pin_id=pin.id, x_mm=hole.x_mm, y_mm=hole.y_mm))
                body = body_mm
            part_service.set_footprint(
                session, part_id, FootprintIn(body_mm=body, holes=given), Author.CLAUDE
            )
            return _part_detail(session, part_id)

    @tool(WRITE)
    def append_part_notes(part_id: int, text: Annotated[str, Field(min_length=1)]) -> PartDetail:
        """Adds markdown to the end of the part's notes (never replaces them), e.g. where a
        pinout came from or a wiring tip."""
        with open_session() as session:
            part_service.append_notes(session, part_id, text)
            return _part_detail(session, part_id)

    @tool(READ)
    def list_tags() -> Tags:
        """All tags, with how many parts and designs use each."""
        with open_session() as session:
            return Tags(tags=tags.list_tags(session))

    @tool(WRITE)
    def create_tag(name: str) -> TagOut:
        """Creates a tag for parts and designs. Names are unique, ignoring case."""
        with open_session() as session:
            return tags.create_tag(session, TagCreate(name=name))

    # --- Designs ---

    @tool(READ)
    def list_designs(
        query: Annotated[str, Field(max_length=200)] | None = None,
    ) -> Designs:
        """Designs, most recently changed first, with part count, Shelf-help project id and
        check counts. query matches names and descriptions."""
        with open_session() as session:
            return Designs(
                designs=[designs.summary(d) for d in designs.list_designs(session, query)]
            )

    @tool(READ)
    def get_design(design_id: int) -> DesignView:
        """A design as a netlist: placed parts (ref, part, position), wires
        (`esp.GPIO21` to `bme.SDA`, colour) and the nets they make, with check counts."""
        with open_session() as session:
            return _view(designs.get_design(session, design_id))

    @tool(WRITE)
    def create_design(
        name: str,
        description_md: str = "",
        shelf_project_id: int | None = None,
        firmware_repo: str | None = None,
        tag_ids: list[int] | None = None,
    ) -> DesignView:
        """Creates an empty design. description_md is markdown. firmware_repo: where its
        firmware lives (a local path or a repository URL)."""
        data = DesignCreate(
            name=name,
            description_md=description_md,
            shelf_project_id=shelf_project_id,
            firmware_repo=firmware_repo,
            tag_ids=tag_ids or [],
        )
        with open_session() as session:
            return _view(designs.create_design(session, data))

    @tool(WRITE)
    def update_design(
        design_id: int,
        name: str | None = None,
        shelf_project_id: int | None = None,
        firmware_repo: str | None = None,
        tag_ids: list[int] | None = None,
    ) -> DesignView:
        """Renames a design, links it to a Shelf-help project or its firmware, or sets its
        tags. shelf_project_id: 0 unlinks; look the id up in Shelf-help before storing it,
        since this app can't check it. firmware_repo: where the firmware lives (a local
        path or a repository URL); an empty string clears it."""
        data = DesignUpdate(
            **_set(
                name=name,
                shelf_project_id=shelf_project_id,
                firmware_repo=firmware_repo,
                tag_ids=tag_ids,
            )
        )
        with open_session() as session:
            return _view(designs.update_design(session, design_id, data))

    @tool(WRITE)
    def append_design_description(
        design_id: int, text: Annotated[str, Field(min_length=1)]
    ) -> DesignView:
        """Adds markdown to the end of the design's description (never replaces it)."""
        with open_session() as session:
            return _view(designs.append_description(session, design_id, text))

    @tool(WRITE)
    def add_parts(design_id: int, parts: list[PlacementIn]) -> DesignView:
        """Places one or more library parts. ref is the short name wires use (`bme`,
        letters, digits and _); left out, it's made from the part's name. x and y are the
        card's top-left corner in canvas px on a 10 px grid; left out, the part goes to the
        right of those already placed. rotation: 0, 90, 180 or 270 clockwise."""
        with open_session() as session:
            design = designs.get_design(session, design_id)
            names = [p.ref or part_service.get_part(session, p.part_id).name for p in parts]
            summary = f"Added {_listed(names)}"
            return _view(designs.add_placements(session, design.id, parts, claude=summary))

    @tool(WRITE)
    def update_placement(
        design_id: int,
        ref: str,
        new_ref: Ref | None = None,
        x: int | None = None,
        y: int | None = None,
        rotation: Rotation | None = None,
        note: str | None = None,
    ) -> DesignView:
        """Moves, rotates, renames or annotates a placed part, found by its ref."""
        with open_session() as session:
            design = designs.get_design(session, design_id)
            placement = designs.placement_by_ref(design, ref)
            summary = _placement_summary(
                placement.ref,
                new_ref,
                moved=x is not None or y is not None,
                rotated=rotation is not None,
                noted=note is not None,
            )
            data = PlacementUpdate(**_set(ref=new_ref, x=x, y=y, rotation=rotation, note=note))
            return _view(
                designs.update_placement(session, design.id, placement.id, data, claude=summary)
            )

    @tool(REMOVE)
    def remove_placement(design_id: int, ref: str) -> DesignView:
        """Removes a placed part and its wires from the design (not from the library).
        A revision is saved first, so the user can undo it."""
        with open_session() as session:
            design = designs.get_design(session, design_id)
            placement = designs.placement_by_ref(design, ref)
            wires = sum(placement.id in (w.a_placement_id, w.b_placement_id) for w in design.wires)
            summary = f"Removed {placement.ref} and its {wires} wire{'s' if wires != 1 else ''}"
            return _view(designs.remove_placement(session, design.id, placement.id, claude=summary))

    @tool(WRITE)
    def connect(design_id: int, wires: list[WireIn]) -> DesignView:
        """Adds wires between pins, as `ref.PIN` (pin names match ignoring case). All are
        added or none. Without a colour, power is red, ground black, others rotate. A pin
        can have many wires; a pin to itself, or a second wire between the same two pins,
        is refused."""
        with open_session() as session:
            summary = f"Connected {_listed([f'{w.a} to {w.b}' for w in wires])}"
            return _view(designs.add_wires(session, design_id, wires, claude=summary))

    @tool(WRITE)
    def update_wire(
        design_id: int,
        a: PinRef,
        b: PinRef,
        color: WireColor | None = None,
        label: Annotated[str, Field(max_length=100)] | None = None,
    ) -> DesignView:
        """Changes the colour or label of the wire between two pins."""
        with open_session() as session:
            design = designs.get_design(session, design_id)
            wire = designs.wire_between(design, a, b)
            data = WireUpdate(**_set(color=color, label=label))
            summary = f"Changed the wire {a} to {b}"
            return _view(designs.update_wire(session, design.id, wire.id, data, claude=summary))

    @tool(REMOVE)
    def disconnect(design_id: int, a: PinRef, b: PinRef) -> DesignView:
        """Removes the wire between two pins (either order). A revision is saved first."""
        with open_session() as session:
            design = designs.get_design(session, design_id)
            wire = designs.wire_between(design, a, b)
            summary = f"Disconnected {a} from {b}"
            return _view(designs.remove_wire(session, design.id, wire.id, claude=summary))

    @tool(READ)
    def check_design(design_id: int) -> DesignChecks:
        """Runs every design check (short circuits, voltage mismatches, SDA/SCL swaps, I2C
        address clashes, risky pins, unverified parts...), errors first. Each result names
        its pins and net."""
        with open_session() as session:
            return run_checks(designs.get_design(session, design_id))

    @tool(READ)
    def get_pin_map(design_id: int, lang: Lang = Lang.C, board: str | None = None) -> PinMapOut:
        """The design's pins as firmware constants: `pins.h` for Arduino/PlatformIO
        (lang "c") or `pins.py` for MicroPython (lang "py", ESP32 boards only). Each signal
        pin of a part wired to the board is `REF_PIN` = the board pin's code name, e.g.
        `BME_SDA = 21`; I2C addresses and buses (I2C_SDA, SPI_SCK...) too. board is the
        board's ref, needed only when the design has more than one. Save `text` as
        `filename` in the firmware and use its constants rather than pin numbers."""
        with open_session() as session:
            return firmware.pin_map(session, design_id, lang, board)

    @tool(READ)
    def get_bringup_sketch(design_id: int, board: str | None = None) -> FirmwareFiles:
        """An Arduino sketch (no libraries) that checks the built circuit against the
        design: I2C parts answer at their addresses, actuator and display pins blink, other
        parts' pins are watched while the user triggers them, analog pins are read. Only
        actuator and display pins are driven. files holds bringup.ino and the pins.h it
        includes; save both in one sketch folder. board: as for get_pin_map."""
        with open_session() as session:
            return firmware.bringup_sketch(session, design_id, board)

    @tool(READ)
    def get_platformio_project(design_id: int, board: str | None = None) -> FirmwareFiles:
        """platformio.ini for the design's board: platform, board id, framework arduino,
        monitor speed, and lib_deps from the parts' libraries for that platform (with the
        Arduino IDE names in a comment). Save it at the project root, next to src/.
        board: as for get_pin_map."""
        with open_session() as session:
            return firmware.platformio_project(session, design_id, board)

    @tool(READ)
    def compare_pin_map(
        design_id: int, text: str, lang: Lang | None = None, board: str | None = None
    ) -> PinMapDrift:
        """Checks a firmware's pins.h or pins.py (its whole text) against the design as it
        is now: changed lists constants whose pin moved, added the newly wired ones,
        removed the ones no longer in the design; up_to_date when there are none.
        pin_map is the current file, to replace the old one with. Its header names the
        design id and board ("Ohm Sweet Ohm design 3, board esp"). Read-only."""
        with open_session() as session:
            return firmware.compare_pin_map(
                session, design_id, PinMapCompare(text=text, lang=lang, board=board)
            )

    @tool(READ)
    def get_wokwi_export(design_id: int, board: str | None = None) -> WokwiExport:
        """The design as Wokwi's diagram.json, for simulation in the Wokwi web editor, VS
        Code extension or wokwi-cli, plus wokwi.toml pointing at the PlatformIO build of
        the board's firmware (from get_platformio_project, same env name). skipped lists
        parts with no Wokwi type, left out with their wires: tell the user what the
        simulation lacks. board: needed for wokwi.toml when the design has several."""
        with open_session() as session:
            return firmware.wokwi_export(session, design_id, board)

    @tool(READ)
    def suggest_wiring(design_id: int, ref: str, board: str | None = None) -> SuggestedWiring:
        """Proposed wires for the unwired pins of the placed part `ref`: buses shared with
        parts already on them, a supply within the part's range, signals on free GPIOs
        away from flash, strapping and input-only pins. Each has a reason, and a warning
        where something needs sorting out (a 5 V signal into a 3.3 V pin). unassigned
        lists pins it left alone and why. Read-only: show the user, then connect the
        ones they want. board: needed when the design has more than one."""
        with open_session() as session:
            return designs.suggest_wiring(designs.get_design(session, design_id), ref, board)

    @tool(READ)
    def list_revisions(design_id: int) -> Revisions:
        """Saved versions of the design, newest first. Each is the design as it was before
        the change in its summary."""
        with open_session() as session:
            return Revisions(
                revisions=revisions_service.list_revisions(designs.get_design(session, design_id))
            )

    @tool(WRITE)
    def restore_revision(design_id: int, revision_id: int) -> DesignView:
        """Puts the design's parts and wires back as they were in a revision. The current
        state is saved as a revision first, so this can be undone too."""
        with open_session() as session:
            return _view(designs.restore_revision(session, design_id, revision_id, Author.CLAUDE))

    # Every tool's arguments, written out in full (see inline_schema).
    for registered in server._tool_manager.list_tools():
        registered.parameters = inline_schema(registered.parameters)

    return server
