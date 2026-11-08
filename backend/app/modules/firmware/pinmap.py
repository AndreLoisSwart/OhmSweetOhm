"""The pin map (build step 10): what firmware needs from a design, as `pins.h` or `pins.py`.

For every part wired to the board, each signal pin becomes a constant named `REF_PIN`
holding the board pin's code name (`BME_SDA = 21`), plus its I2C address. Buses used by
the parts get their own constants (`I2C_SDA`, `SPI_SCK`). The output depends only on the
design's placements, parts and wires, so regenerating it and comparing shows drift.
"""

import re
from dataclasses import dataclass, field
from enum import StrEnum

from app.core.errors import ConflictError, NotFoundError
from app.modules.checks.context import Context, CPin
from app.modules.designs.models import Design, Placement
from app.modules.parts.models import PartKind, PinFlag, PinKind

NOT_SIGNAL = {PinKind.POWER_OUT, PinKind.POWER_IN, PinKind.GROUND, PinKind.NC}

FLAG_NOTES = {
    PinFlag.FLASH: "flash pin, don't use",
    PinFlag.STRAPPING: "strapping pin, affects boot",
    PinFlag.BOOT_HIGH: "must be high at boot",
    PinFlag.BOOT_LOW: "must be low at boot",
    PinFlag.INPUT_ONLY: "input only",
    PinFlag.ADC2: "ADC2, no analog with WiFi on",
}

# Bus roles, in the order their constants are written.
BUSES = {
    "I2C": ((PinKind.I2C_SDA, "SDA"), (PinKind.I2C_SCL, "SCL")),
    "SPI": ((PinKind.SPI_SCK, "SCK"), (PinKind.SPI_MOSI, "MOSI"), (PinKind.SPI_MISO, "MISO")),
}


class Lang(StrEnum):
    C = "c"  # Arduino / PlatformIO C++ header
    PY = "py"  # MicroPython module


FILENAMES = {Lang.C: "pins.h", Lang.PY: "pins.py"}


@dataclass
class Constant:
    name: str
    value: str  # a code name (`21`, `A0`) or a hex I2C address
    comment: str = ""
    # For a pin constant: the part's pin and the board pin it's on (the bring-up sketch
    # decides from these how to test it).
    pin: CPin | None = None
    board_pin: CPin | None = None


@dataclass
class Block:
    """One part's constants, with what couldn't be mapped."""

    title: str
    placement: Placement
    constants: list[Constant] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class PinMap:
    design: Design
    board: Placement
    blocks: list[Block]
    buses: list[Constant]
    unverified: list[str]


def identifier(text: str) -> str:
    """Upper case, with anything not a letter or digit as `_`."""
    return re.sub(r"[^A-Z0-9]+", "_", text.upper()).strip("_")


def boards_of(design: Design) -> list[Placement]:
    return sorted(
        (p for p in design.placements if p.part.kind == PartKind.BOARD), key=lambda p: p.ref
    )


def choose_board(design: Design, ref: str | None) -> Placement:
    if ref:
        for placement in design.placements:
            if placement.ref.lower() == ref.strip().lower():
                return placement
        raise NotFoundError(f'No part "{ref}" in this design')
    boards = boards_of(design)
    if not boards:
        raise ConflictError("The design has no board, so there are no pins to map. Place one")
    if len(boards) > 1:
        refs = ", ".join(b.ref for b in boards)
        raise ConflictError(f"The design has more than one board ({refs}); say which one")
    return boards[0]


def _code_name(pin: CPin, ctx: Context) -> str | None:
    """The board pin's code name, or a tied pin's (the Uno's SDA is A4)."""
    if code := pin.pin.effective_code_name:
        return code
    if pin.pin.tie:
        for other in pin.placement.part.pins:
            if other.tie == pin.pin.tie and (code := other.effective_code_name):
                return code
    return None


def build(design: Design, board_ref: str | None = None) -> PinMap:
    board = choose_board(design, board_ref)
    ctx = Context.build(design)
    blocks: list[Block] = []
    bus_values: dict[str, list[tuple[str | None, ...]]] = {name: [] for name in BUSES}
    names: set[str] = set()

    def unique(name: str) -> str:
        n, candidate = 2, name
        while candidate in names:
            candidate = f"{name}_{n}"
            n += 1
        names.add(candidate)
        return candidate

    for placement in sorted(design.placements, key=lambda p: p.ref):
        if placement is board:
            continue
        part = placement.part
        block = Block(f"{placement.ref}: {part.name}", placement)
        roles: dict[PinKind, str] = {}
        for pin in ctx.placement_pins(placement):
            if pin.kind in NOT_SIGNAL:
                continue
            net = ctx.net_of.get(pin.key)
            if net is None:
                block.notes.append(f"{pin.key} isn't wired")
                continue
            on_board = sorted(
                (p for p in net.pins if p.placement is board and p.kind not in NOT_SIGNAL),
                key=lambda p: p.key.lower(),
            )
            if not on_board:
                block.notes.append(f"{pin.key} isn't wired to {board.ref}")
                continue
            coded = [(p, code) for p in on_board if (code := _code_name(p, ctx))]
            if not coded:
                block.notes.append(f"{pin.key}: {on_board[0].key} has no code name")
                continue
            board_pin, code = coded[0]
            comment = [board_pin.key]
            comment += [FLAG_NOTES[PinFlag(f)] for f in board_pin.pin.flags if f in FLAG_NOTES]
            if len(on_board) > 1:
                comment.append("also on " + ", ".join(p.key for p in on_board[1:]))
            name = unique(identifier(f"{placement.ref}_{pin.pin.name}") or placement.ref.upper())
            block.constants.append(Constant(name, code, ", ".join(comment), pin, board_pin))
            for roles_of_bus in BUSES.values():
                for kind, _ in roles_of_bus:
                    if pin.has_role(kind):
                        roles.setdefault(kind, code)
        if part.i2c_addresses:
            first, *others = part.i2c_addresses
            others_text = ", ".join(f"0x{a:02X}" for a in others)
            block.constants.append(
                Constant(
                    unique(identifier(f"{placement.ref}_I2C_ADDR")),
                    f"0x{first:02X}",
                    f"also {others_text}" if others else "",
                )
            )
        for bus, roles_of_bus in BUSES.items():
            values = tuple(roles.get(kind) for kind, _ in roles_of_bus)
            if any(values) and values not in bus_values[bus]:
                bus_values[bus].append(values)
        if block.constants or block.notes:
            blocks.append(block)

    buses: list[Constant] = []
    for bus, found in bus_values.items():
        for i, values in enumerate(found):
            prefix = bus if len(found) == 1 else f"{bus}{i}"
            for (_, role), value in zip(BUSES[bus], values, strict=True):
                if value:
                    buses.append(Constant(unique(f"{prefix}_{role}"), value))

    unverified = sorted(p.ref for p in design.placements if not p.part.verified)
    return PinMap(design, board, blocks, buses, unverified)


def _is_number(value: str) -> bool:
    return value.isdigit() or value.lower().startswith("0x")


def render(pin_map: PinMap, lang: Lang) -> str:
    if lang == Lang.PY:
        named = [
            f"{c.name} = {c.value}"
            for block in pin_map.blocks
            for c in block.constants
            if not _is_number(c.value)
        ]
        if named:
            raise ConflictError(
                "MicroPython needs GPIO numbers, and these board pins are named: "
                + ", ".join(named)
                + ". Use pins.h, or set the board pins' code names"
            )
    mark = "//" if lang == Lang.C else "#"
    board = pin_map.board
    lines = [
        f"{mark} Pin map for {pin_map.design.name} on {board.ref} ({board.part.name}).",
        f"{mark} Generated by Ohm Sweet Ohm from the design's wires. Don't edit it: change",
        f"{mark} the design and generate it again.",
        # Lets Claude find the design from a firmware repo, to check for drift.
        f"{mark} Ohm Sweet Ohm design {pin_map.design.id}, board {board.ref}.",
    ]
    if pin_map.unverified:
        lines.append(
            f"{mark} Unverified parts, check their pins first: {', '.join(pin_map.unverified)}"
        )
    if lang == Lang.C:
        lines += ["", "#pragma once", "", "#include <stdint.h>"]

    def constant(c: Constant) -> str:
        line = (
            f"constexpr uint8_t {c.name} = {c.value};"
            if lang == Lang.C
            else f"{c.name} = {c.value}"
        )
        return f"{line}  {mark} {c.comment}" if c.comment else line

    for block in pin_map.blocks:
        lines += ["", f"{mark} {block.title}"]
        lines += [constant(c) for c in block.constants]
        lines += [f"{mark} {note}" for note in block.notes]
    if pin_map.buses:
        lines += ["", f"{mark} Buses"]
        lines += [constant(c) for c in pin_map.buses]
    if not pin_map.blocks:
        lines += ["", f"{mark} Nothing is wired to {board.ref} yet."]
    return "\n".join(lines) + "\n"


# Drift (build step 13): a firmware's pin map against the design as it is now.

_C_CONSTANT = re.compile(r"^\s*constexpr\s+[\w:]+\s+(\w+)\s*=\s*([^;]+);", re.M)
_C_DEFINE = re.compile(r"^\s*#define\s+(\w+)\s+(\S+)", re.M)
_PY_CONSTANT = re.compile(r"^(\w+)\s*=\s*([^#\n]+)", re.M)


def constants_of(pin_map: PinMap) -> dict[str, Constant]:
    """Every constant the pin map writes, by name."""
    found = {c.name: c for block in pin_map.blocks for c in block.constants}
    found |= {c.name: c for c in pin_map.buses}
    return found


def parse_constants(text: str) -> dict[str, str]:
    """NAME → value from a pins.h (constexpr or #define) or a pins.py."""
    if "constexpr" in text or "#define" in text:
        pairs = _C_CONSTANT.findall(text) + _C_DEFINE.findall(text)
    else:
        pairs = _PY_CONSTANT.findall(text)
    return {name: value.strip() for name, value in pairs if name != "pragma"}


def _same(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


@dataclass
class Drift:
    changed: list[tuple[Constant, str]]  # (the design's constant, the file's value)
    added: list[Constant]  # in the design, not in the file
    removed: list[tuple[str, str]]  # in the file, no longer in the design


def compare(pin_map: PinMap, text: str) -> Drift:
    design = constants_of(pin_map)
    file = parse_constants(text)
    return Drift(
        changed=[
            (c, file[name])
            for name, c in design.items()
            if name in file and not _same(file[name], c.value)
        ],
        added=[c for name, c in design.items() if name not in file],
        removed=[(name, value) for name, value in file.items() if name not in design],
    )
