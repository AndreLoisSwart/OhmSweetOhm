"""The design checks (docs/checks.md): one function per rule, each returning its results.

Rules are facts about the wiring, not opinions. Each says which pins and net it's about,
so the app can highlight them and Claude can explain them.
"""

from collections.abc import Callable, Iterator
from itertools import combinations

from app.modules.checks.context import TOLERANCE_V, CNet, Context, CPin
from app.modules.checks.schemas import CheckResult, Severity
from app.modules.parts.models import PartKind, PinFlag, PinKind

Rule = Callable[[Context], Iterator[CheckResult]]
RULES: list[Rule] = []


def rule(fn: Rule) -> Rule:
    RULES.append(fn)
    return fn


def volts(v: float) -> str:
    return f"{v:g} V"


def other_parts(net: CNet, pin: CPin) -> list[CPin]:
    return [p for p in net.pins if p.placement is not pin.placement]


@rule
def power_short(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        sources, grounds = net.of_kind(PinKind.POWER_OUT), net.of_kind(PinKind.GROUND)
        if sources and grounds:
            yield CheckResult(
                id="power_short",
                severity=Severity.ERROR,
                message=f"{sources[0].key} is wired straight to ground ({grounds[0].key})",
                pins=[sources[0].key, grounds[0].key],
                net=net.name,
            )


@rule
def supply_clash(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        sources = [p for p in net.of_kind(PinKind.POWER_OUT) if p.pin.voltage]
        for a, b in combinations(sources, 2):
            if abs(a.pin.voltage - b.pin.voltage) > TOLERANCE_V:
                yield CheckResult(
                    id="supply_clash",
                    severity=Severity.ERROR,
                    message=(
                        f"{a.key} ({volts(a.pin.voltage)}) and {b.key} "
                        f"({volts(b.pin.voltage)}) are tied together"
                    ),
                    pins=[a.key, b.key],
                    net=net.name,
                )


@rule
def output_to_output(ctx: Context) -> Iterator[CheckResult]:
    # Two supplies of the same voltage tied together fight each other (one back-feeds
    # the other). Different voltages are supply_clash; TX to TX is uart_crossed.
    for net in ctx.nets:
        sources = [p for p in net.of_kind(PinKind.POWER_OUT) if p.pin.voltage]
        for a, b in combinations(sources, 2):
            if a.placement is not b.placement and abs(a.pin.voltage - b.pin.voltage) <= TOLERANCE_V:
                yield CheckResult(
                    id="output_to_output",
                    severity=Severity.WARNING,
                    message=(
                        f"Two supplies drive the same net: {a.key} and {b.key}. "
                        "Use one, unless both are made to share"
                    ),
                    pins=[a.key, b.key],
                    net=net.name,
                )


@rule
def overvoltage(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        if not (level := net.voltage):
            continue
        v, driver = level
        for pin in net.pins:
            if pin is driver or not (pin.is_signal or pin.kind == PinKind.POWER_IN):
                continue
            rated = pin.max_v
            if rated is None or v <= rated + TOLERANCE_V:
                continue
            if pin.flagged(PinFlag.FIVE_V_TOLERANT) and v <= 5 + TOLERANCE_V:
                continue
            yield CheckResult(
                id="overvoltage",
                severity=Severity.ERROR,
                message=(
                    # I2C lines are open-drain: the level comes from the pull-ups.
                    f"{pin.key} ({volts(rated)} max) is on an I2C line pulled up to "
                    f"{volts(v)} by {driver.key}'s side"
                    if _is_i2c(pin) or _is_i2c(driver)
                    else f"{pin.key} ({volts(rated)} max) is on a {volts(v)} net "
                    f"driven by {driver.key}"
                ),
                pins=[pin.key, driver.key],
                net=net.name,
            )


@rule
def undervoltage_supply(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        if not (power := net.power_v):
            continue
        v, source = power
        for pin in net.of_kind(PinKind.POWER_IN):
            # The part's lowest supply voltage; failing that, what the pin says it needs.
            low = pin.part.supply_min_v if pin.part.supply_min_v is not None else pin.pin.voltage
            if low is not None and v < low - TOLERANCE_V:
                yield CheckResult(
                    id="undervoltage_supply",
                    severity=Severity.WARNING,
                    message=(
                        f"{pin.key} needs at least {volts(low)} but gets {volts(v)} "
                        f"from {source.key}"
                    ),
                    pins=[pin.key, source.key],
                    net=net.name,
                )


@rule
def no_ground(ctx: Context) -> Iterator[CheckResult]:
    for placement in ctx.design.placements:
        pins = ctx.placement_pins(placement)
        grounds = [p for p in pins if p.kind == PinKind.GROUND]
        # Power wired to another part: the current needs a way back.
        powered = any(
            other_parts(ctx.net_of[p.key], p)
            for p in pins
            if p.kind in (PinKind.POWER_IN, PinKind.POWER_OUT) and ctx.wired(p)
        )
        if not grounds or not powered:
            continue
        shared = any(
            any(o.kind == PinKind.GROUND for o in other_parts(ctx.net_of[g.key], g))
            for g in grounds
            if ctx.wired(g)
        )
        if not shared:
            yield CheckResult(
                id="no_ground",
                severity=Severity.ERROR,
                message=f"{placement.ref} has power wired but no ground shared with another part",
                pins=[g.key for g in grounds],
            )


@rule
def unpowered(ctx: Context) -> Iterator[CheckResult]:
    for placement in ctx.design.placements:
        # Boards are usually powered over USB, and power parts are the supply.
        if placement.part.kind in (PartKind.BOARD, PartKind.POWER):
            continue
        inputs = [p for p in ctx.placement_pins(placement) if p.kind == PinKind.POWER_IN]
        if inputs and not any(ctx.wired(p) for p in inputs):
            yield CheckResult(
                id="unpowered",
                severity=Severity.WARNING,
                message=f"{placement.ref} has no power wired ({', '.join(p.key for p in inputs)})",
                pins=[p.key for p in inputs],
            )


@rule
def uart_crossed(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        for kind, name in ((PinKind.UART_TX, "TX"), (PinKind.UART_RX, "RX")):
            same = net.of_kind(kind)
            for a, b in combinations(same, 2):
                if a.placement is not b.placement:
                    yield CheckResult(
                        id="uart_crossed",
                        severity=Severity.WARNING,
                        message=(
                            f"{a.key} is wired to {b.key}: UART {name} goes to the other "
                            f"side's {'RX' if name == 'TX' else 'TX'}"
                        ),
                        pins=[a.key, b.key],
                        net=net.name,
                    )


def _only(pin: CPin, role: PinKind, other: PinKind) -> bool:
    return pin.has_role(role) and not pin.has_role(other)


def _is_i2c(pin: CPin) -> bool:
    return pin.kind in (PinKind.I2C_SDA, PinKind.I2C_SCL)


@rule
def i2c_mismatch(ctx: Context) -> Iterator[CheckResult]:
    # One error per net: SDA-only and SCL-only pins of different parts on it, at least
    # one of them so by kind (a GPIO whose usual role is SDA, wired to a sensor's SCL).
    for net in ctx.nets:
        sda = [p for p in net.pins if _only(p, PinKind.I2C_SDA, PinKind.I2C_SCL)]
        scl = [p for p in net.pins if _only(p, PinKind.I2C_SCL, PinKind.I2C_SDA)]
        pairs = [
            (a, b)
            for a in sda
            for b in scl
            if a.placement is not b.placement
            and (a.kind == PinKind.I2C_SDA or b.kind == PinKind.I2C_SCL)
        ]
        if not pairs:
            continue
        involved = list(dict.fromkeys(p for pair in pairs for p in pair))
        named = ", ".join(
            f"{p.key} ({'SDA' if p.has_role(PinKind.I2C_SDA) else 'SCL'})" for p in involved
        )
        yield CheckResult(
            id="i2c_mismatch",
            severity=Severity.ERROR,
            message=f"SDA and SCL are wired together: {named}",
            pins=[p.key for p in involved],
            net=net.name,
        )


def i2c_buses(ctx: Context) -> list[list[CPin]]:
    """The I2C pins of each bus. Parts are on one bus when their SDA or SCL pins share a
    net, either way round, so a swapped pair still counts as one bus."""
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        while parent[x] != x:
            x = parent[x]
        return x

    i2c_nets = [
        net
        for net in ctx.nets
        if any(p.has_role(PinKind.I2C_SDA) or p.has_role(PinKind.I2C_SCL) for p in net.pins)
        and any(_is_i2c(p) for p in net.pins)
    ]
    for net in i2c_nets:
        placements = [p.placement.id for p in net.pins]
        for other in placements[1:]:
            parent[find(other)] = find(placements[0])
    buses: dict[int, list[CPin]] = {}
    for net in i2c_nets:
        for pin in net.pins:
            if pin.has_role(PinKind.I2C_SDA) or pin.has_role(PinKind.I2C_SCL):
                buses.setdefault(find(pin.placement.id), []).append(pin)
    return list(buses.values())


@rule
def i2c_address_clash(ctx: Context) -> Iterator[CheckResult]:
    for bus in i2c_buses(ctx):
        devices: dict[int, list[CPin]] = {}
        for pin in bus:
            if pin.part.i2c_addresses and _is_i2c(pin):
                devices.setdefault(pin.placement.id, []).append(pin)
        by_address: dict[int, list[list[CPin]]] = {}
        for pins in devices.values():
            by_address.setdefault(pins[0].part.i2c_addresses[0], []).append(pins)
        for address, parts_pins in by_address.items():
            if len(parts_pins) > 1:
                refs = ", ".join(pins[0].placement.ref for pins in parts_pins)
                yield CheckResult(
                    id="i2c_address_clash",
                    severity=Severity.ERROR,
                    message=(
                        f"{refs} share the I2C address 0x{address:02x} on one bus. "
                        "Change one's address (if it has another) or use a second bus"
                    ),
                    pins=[p.key for pins in parts_pins for p in pins],
                    net=ctx.net_of[parts_pins[0][0].key].name,
                )


@rule
def i2c_pullups(ctx: Context) -> Iterator[CheckResult]:
    # Parts don't record whether they carry pull-ups yet, so this is a reminder per bus.
    for bus in i2c_buses(ctx):
        yield CheckResult(
            id="i2c_pullups",
            severity=Severity.NOTE,
            message="Make sure the I2C bus has pull-ups. Most breakouts include them",
            pins=[p.key for p in bus],
            net=ctx.net_of[bus[0].key].name,
        )


@rule
def flash_pin(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        for pin in net.pins:
            if pin.flagged(PinFlag.FLASH):
                yield CheckResult(
                    id="flash_pin",
                    severity=Severity.ERROR,
                    message=f"{pin.key} is wired to the board's flash memory; don't use it",
                    pins=[pin.key],
                    net=net.name,
                )


# Kinds that need something driving them: an input-only pin can't.
NEEDS_DRIVING = {
    PinKind.SPI_CS,
    PinKind.SPI_MOSI,
    PinKind.SPI_SCK,
    PinKind.UART_RX,
    PinKind.I2C_SDA,
    PinKind.I2C_SCL,
    PinKind.ENABLE,
    PinKind.RESET,
}


@rule
def input_only_driven(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        for pin in net.pins:
            if not pin.flagged(PinFlag.INPUT_ONLY):
                continue
            for other in other_parts(net, pin):
                if other.kind in NEEDS_DRIVING or (
                    other.part.kind == PartKind.ACTUATOR and other.is_signal
                ):
                    yield CheckResult(
                        id="input_only_driven",
                        severity=Severity.WARNING,
                        message=f"{pin.key} is input-only, but {other.key} needs driving",
                        pins=[pin.key, other.key],
                        net=net.name,
                    )
                    break


@rule
def strapping_pin(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        for pin in net.pins:
            if pin.flagged(PinFlag.STRAPPING, PinFlag.BOOT_HIGH, PinFlag.BOOT_LOW):
                yield CheckResult(
                    id="strapping_pin",
                    severity=Severity.WARNING,
                    message=(
                        f"{pin.key} is read at boot; what's attached can stop the board "
                        "starting. Pick another pin if one is free"
                    ),
                    pins=[pin.key],
                    net=net.name,
                )


@rule
def adc2_wifi(ctx: Context) -> Iterator[CheckResult]:
    # Only ESP32-class boards carry the adc2 flag, and they all have WiFi.
    for net in ctx.nets:
        for pin in net.pins:
            if not pin.flagged(PinFlag.ADC2):
                continue
            analog = [o for o in other_parts(net, pin) if o.kind == PinKind.ANALOG]
            if analog:
                yield CheckResult(
                    id="adc2_wifi",
                    severity=Severity.WARNING,
                    message=(
                        f"{pin.key} reads {analog[0].key} on ADC2, which doesn't work while "
                        "WiFi is on. Use an ADC1 pin"
                    ),
                    pins=[pin.key, analog[0].key],
                    net=net.name,
                )


@rule
def nc_connected(ctx: Context) -> Iterator[CheckResult]:
    for net in ctx.nets:
        for pin in net.of_kind(PinKind.NC):
            yield CheckResult(
                id="nc_connected",
                severity=Severity.WARNING,
                message=f"{pin.key} isn't connected inside the part, so its wire does nothing",
                pins=[pin.key],
                net=net.name,
            )


@rule
def unverified_part(ctx: Context) -> Iterator[CheckResult]:
    for placement in ctx.design.placements:
        if not placement.part.verified:
            yield CheckResult(
                id="unverified_part",
                severity=Severity.WARNING,
                message=(
                    f"{placement.ref} ({placement.part.name}) isn't verified, so its pinout "
                    "may be wrong"
                ),
                pins=[],
            )


@rule
def floating_input(ctx: Context) -> Iterator[CheckResult]:
    for pin in ctx.pins.values():
        if pin.kind in (PinKind.ENABLE, PinKind.RESET) and not ctx.wired(pin):
            yield CheckResult(
                id="floating_input",
                severity=Severity.NOTE,
                message=(
                    f"{pin.key} isn't wired. Fine if the part pulls it up itself (most "
                    "boards and breakouts do)"
                ),
                pins=[pin.key],
            )
