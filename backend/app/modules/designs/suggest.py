"""Pin assignment helper: wires for a placed part's unwired pins, to free board pins
that suit them. Read-only: it proposes wires, and the canvas or Claude adds them.

Buses are shared (a second I2C sensor goes on the same SDA and SCL), supplies are
matched to the part's supply range, and plain signals go to free GPIOs, avoiding flash,
input-only, strapping and boot pins and keeping bus and analog pins free where it can.
"""

from dataclasses import dataclass, field

from app.core.errors import ConflictError, NotFoundError
from app.modules.checks.context import LOGIC_LEVEL, TOLERANCE_V, Context, CPin
from app.modules.designs.models import Design, Placement
from app.modules.parts.models import PartKind, PinFlag, PinKind, Platform

BUSES = {PinKind.I2C_SDA, PinKind.I2C_SCL, PinKind.SPI_SCK, PinKind.SPI_MOSI, PinKind.SPI_MISO}
BUS_NAMES = {
    PinKind.I2C_SDA: "I2C SDA",
    PinKind.I2C_SCL: "I2C SCL",
    PinKind.SPI_SCK: "SPI SCK",
    PinKind.SPI_MOSI: "SPI MOSI",
    PinKind.SPI_MISO: "SPI MISO",
}
# Roles worth keeping a pin free for: a GPIO that is also one of these is used last.
SPECIAL = {k.value for k in (*BUSES, PinKind.SPI_CS, PinKind.UART_TX, PinKind.UART_RX)}
NOT_SUGGESTED = {
    PinKind.POWER_OUT: "it's a supply: wire it to what it powers",
    PinKind.ENABLE: "enable pins depend on the circuit: wire it by hand",
    PinKind.RESET: "reset pins are usually left unwired or go to a button",
    PinKind.NC: "not connected",
    PinKind.OTHER: "no rule for this pin: wire it by hand",
}


@dataclass
class Suggestion:
    a: str  # the part's pin, `ref.PIN`
    b: str  # where it goes
    reason: str
    warning: str = ""


@dataclass
class Unassigned:
    pin: str
    reason: str


@dataclass
class Suggested:
    placement: str
    board: str
    wires: list[Suggestion] = field(default_factory=list)
    unassigned: list[Unassigned] = field(default_factory=list)


def _find(design: Design, ref: str) -> Placement:
    for placement in design.placements:
        if placement.ref.lower() == ref.strip().lower():
            return placement
    raise NotFoundError(f'No part "{ref}" in this design')


def _board(design: Design, part: Placement, ref: str | None) -> Placement:
    if ref:
        board = _find(design, ref)
        if board.part.kind != PartKind.BOARD:
            raise ConflictError(f"{board.ref} isn't a board")
        return board
    boards = [p for p in design.placements if p.part.kind == PartKind.BOARD and p is not part]
    if not boards:
        raise ConflictError("The design has no board to wire to. Place one")
    if len(boards) > 1:
        refs = ", ".join(sorted(b.ref for b in boards))
        raise ConflictError(f"The design has more than one board ({refs}); say which one")
    return boards[0]


def _volts(v: float) -> str:
    return f"{v:g} V"


class _Planner:
    def __init__(self, design: Design, part: Placement, board: Placement):
        self.ctx = Context.build(design)
        self.part, self.board = part, board
        self.board_pins = self.ctx.placement_pins(board)
        self.taken: set[str] = set()  # board pins given out in this run
        self.given: list[str] = []  # the same, once per wire (a shared pin twice)
        self.esp32 = board.part.platform == Platform.ESP32

    def free(self, pin: CPin) -> bool:
        return not self.ctx.wired(pin) and pin.key not in self.taken

    def take(self, pin: CPin) -> CPin:
        self.taken.add(pin.key)
        self.given.append(pin.key)
        return pin

    # Buses -------------------------------------------------------------------------

    def bus_pin(self, role: PinKind) -> tuple[CPin, str] | None:
        """The board's pin for a shared bus line: the one already carrying it to another
        part, else a free pin with that role (its main kind first)."""
        for pin in self.board_pins:
            net = self.ctx.net_of.get(pin.key)
            if pin.has_role(role) and net:
                users = [p for p in net.pins if p.placement is not self.board and p.kind == role]
                if users:
                    return pin, f"{BUS_NAMES[role]}, shared with {users[0].key}"
        candidates = [p for p in self.board_pins if p.has_role(role) and self.free(p)]
        candidates.sort(key=lambda p: p.kind != role)
        if candidates:
            return self.take(candidates[0]), f"the board's {BUS_NAMES[role]}"
        return None

    # Signals -----------------------------------------------------------------------

    def gpio_cost(self, pin: CPin, analog: bool) -> int | None:
        """How much a board pin costs for a signal; None when it can't take one."""
        if pin.flagged(PinFlag.FLASH) or pin.kind in (PinKind.UART_TX, PinKind.UART_RX):
            return None
        if analog:
            if not pin.has_role(PinKind.ANALOG):
                return None
        elif not pin.has_role(PinKind.GPIO) or pin.flagged(PinFlag.INPUT_ONLY):
            return None
        cost = 0
        if pin.flagged(PinFlag.STRAPPING, PinFlag.BOOT_HIGH, PinFlag.BOOT_LOW):
            cost += 10
        if SPECIAL & set(pin.pin.functions) or pin.kind.value in SPECIAL:
            cost += 3
        if analog:
            # ADC2 can't read while WiFi is on; input-only pins suit analog best.
            if self.esp32 and pin.flagged(PinFlag.ADC2):
                cost += 8
            if not pin.flagged(PinFlag.INPUT_ONLY):
                cost += 1
        elif pin.has_role(PinKind.ANALOG):
            cost += 1  # keep analog pins for analog parts
        return cost

    def signal_pin(self, analog: bool = False, prefer: PinKind | None = None) -> CPin | None:
        if prefer:
            for pin in self.board_pins:
                if (
                    pin.has_role(prefer)
                    and self.free(pin)
                    and self.gpio_cost(pin, analog) is not None
                ):
                    return self.take(pin)
        scored = [
            (cost, i, pin)
            for i, pin in enumerate(self.board_pins)
            if self.free(pin) and (cost := self.gpio_cost(pin, analog)) is not None
        ]
        if not scored:
            return None
        return self.take(min(scored, key=lambda s: s[:2])[2])

    def why(self, pin: CPin, analog: bool) -> str:
        text = "a free analog pin" if analog else "a free GPIO"
        if any(p.flagged(PinFlag.STRAPPING) for p in self.board_pins) and not pin.flagged(
            PinFlag.STRAPPING
        ):
            text += ", not a strapping pin"
        return text

    def level_warning(self, pin: CPin, to: CPin) -> str:
        drive = pin.drive_v
        limit = to.max_v
        if drive and limit and drive > limit + TOLERANCE_V:
            return (
                f"{pin.key} drives {_volts(drive)} into a {_volts(limit)} pin: put a divider "
                "or level shifter between them"
            )
        return ""

    # Power -------------------------------------------------------------------------

    def supply(self, pin: CPin) -> tuple[CPin, str] | Unassigned:
        part = pin.part
        lo, hi = part.supply_min_v, part.supply_max_v
        want = pin.pin.voltage or LOGIC_LEVEL.get(part.logic_voltage)
        if lo is None and hi is None and want is not None:
            lo = hi = want
        sources = [
            p
            for p in self.ctx.pins.values()
            if p.kind == PinKind.POWER_OUT
            and p.placement is not self.part
            and p.pin.voltage is not None
            and (lo is None or p.pin.voltage >= lo - TOLERANCE_V)
            and (hi is None or p.pin.voltage <= hi + TOLERANCE_V)
        ]
        range_text = (
            f"{_volts(lo)}–{_volts(hi)}"
            if lo is not None and hi is not None and lo != hi
            else _volts(lo or hi)
            if (lo or hi)
            else "its supply"
        )
        if not sources:
            return Unassigned(
                pin.key, f"no supply for {range_text} in the design: add one, then wire it"
            )
        # The board's own pins first, then the closest to what the part wants.
        sources.sort(
            key=lambda p: (
                p.placement is not self.board,
                abs(p.pin.voltage - want) if want else 0,
                p.key,
            )
        )
        source = sources[0]
        return source, f"{_volts(source.pin.voltage)} supply (it takes {range_text})"

    def ground(self) -> CPin | None:
        """A ground pin of the board, the one with the fewest wires on it (its grounds are
        joined inside it, so any will do)."""
        grounds = [p for p in self.board_pins if p.kind == PinKind.GROUND]
        if not grounds:
            return None
        return self.take(min(grounds, key=lambda p: self.wire_count(p)))

    def wire_count(self, pin: CPin) -> int:
        ends = [(w.a_placement, w.a_pin) for w in self.ctx.design.wires] + [
            (w.b_placement, w.b_pin) for w in self.ctx.design.wires
        ]
        given = sum(1 for key in self.given if key == pin.key)
        return given + sum(1 for pl, pn in ends if pl is pin.placement and pn is pin.pin)


def suggest(design: Design, ref: str, board_ref: str | None = None) -> Suggested:
    part = _find(design, ref)
    if part.part.kind == PartKind.BOARD and not board_ref:
        raise ConflictError(f"{part.ref} is a board: suggest wiring for the parts wired to it")
    board = _board(design, part, board_ref)
    if board is part:
        raise ConflictError("A part can't be wired to itself")
    plan = _Planner(design, part, board)
    out = Suggested(placement=part.ref, board=board.ref)
    groups_done: set[str] = set()

    for pin in plan.ctx.placement_pins(part):
        # Pins joined inside the part (its grounds, a tie) need one wire between them.
        group = "\0ground" if pin.kind == PinKind.GROUND else pin.pin.tie
        if plan.ctx.wired(pin) or (group and group in groups_done):
            if group:
                groups_done.add(group)
            continue
        if group:
            groups_done.add(group)

        def add(to: CPin, reason: str, warning: str = "", pin: CPin = pin) -> None:
            out.wires.append(Suggestion(pin.key, to.key, reason, warning))

        kind = pin.kind
        if kind == PinKind.GROUND:
            if to := plan.ground():
                add(to, "ground")
            else:
                out.unassigned.append(Unassigned(pin.key, f"{board.ref} has no ground pin"))
        elif kind == PinKind.POWER_IN:
            found = plan.supply(pin)
            if isinstance(found, Unassigned):
                out.unassigned.append(found)
            else:
                add(*found)
        elif kind in BUSES:
            if found := plan.bus_pin(kind):
                add(found[0], found[1], plan.level_warning(pin, found[0]))
            else:
                out.unassigned.append(
                    Unassigned(pin.key, f"{board.ref} has no free {BUS_NAMES[kind]} pin")
                )
        elif kind in (PinKind.UART_TX, PinKind.UART_RX):
            # Crossed: the part's TX goes to the board's RX. A spare UART first, since the
            # board's main one is usually its USB serial.
            other = PinKind.UART_RX if kind == PinKind.UART_TX else PinKind.UART_TX
            spare = [p for p in plan.board_pins if other.value in p.pin.functions and plan.free(p)]
            main = [p for p in plan.board_pins if p.kind == other and plan.free(p)]
            if spare:
                to = plan.take(spare[0])
                add(to, f"a spare UART {other.value[-2:].upper()} (TX and RX cross)")
            elif main:
                to = plan.take(main[0])
                add(
                    to,
                    f"the board's UART {other.value[-2:].upper()} (TX and RX cross)",
                    "this is also the USB serial: unplug the part to upload",
                )
            else:
                out.unassigned.append(Unassigned(pin.key, f"{board.ref} has no free UART pin"))
        elif kind in (PinKind.GPIO, PinKind.ANALOG, PinKind.SPI_CS):
            analog = kind == PinKind.ANALOG
            prefer = PinKind.SPI_CS if kind == PinKind.SPI_CS else None
            if to := plan.signal_pin(analog, prefer):
                reason = (
                    "the board's SPI CS" if prefer and to.has_role(prefer) else plan.why(to, analog)
                )
                add(to, reason, plan.level_warning(pin, to))
            else:
                what = "analog" if analog else "GPIO"
                out.unassigned.append(Unassigned(pin.key, f"{board.ref} has no free {what} pin"))
        else:
            out.unassigned.append(Unassigned(pin.key, NOT_SUGGESTED.get(kind, "wire it by hand")))
    return out
