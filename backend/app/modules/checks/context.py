"""What the rules look at: the design's placements, pins and computed nets."""

from dataclasses import dataclass, field

from app.modules.designs.models import Design, Placement
from app.modules.designs.nets import compute_nets
from app.modules.parts.models import LogicVoltage, Part, Pin, PinFlag, PinKind

TOLERANCE_V = 0.25
LOGIC_LEVEL = {LogicVoltage.V3V3: 3.3, LogicVoltage.V5: 5.0}
POWER = {PinKind.POWER_OUT, PinKind.POWER_IN}


@dataclass(frozen=True)
class CPin:
    key: str  # `ref.PIN`
    placement: Placement
    pin: Pin

    @property
    def part(self) -> Part:
        return self.placement.part

    @property
    def kind(self) -> PinKind:
        return self.pin.kind

    def has_role(self, kind: PinKind) -> bool:
        """Its main kind, or one of its alternate functions."""
        return self.pin.kind == kind or kind.value in self.pin.functions

    def flagged(self, *flags: PinFlag) -> bool:
        return any(f.value in self.pin.flags for f in flags)

    @property
    def is_signal(self) -> bool:
        return self.kind not in POWER and self.kind not in (PinKind.GROUND, PinKind.NC)

    @property
    def drive_v(self) -> float | None:
        """The level a signal pin drives: its part's fixed logic level, if it has one."""
        return LOGIC_LEVEL.get(self.part.logic_voltage)

    @property
    def max_v(self) -> float | None:
        """The most this pin takes: its own rating, else its part's (docs/data-model.md)."""
        if self.kind == PinKind.POWER_IN:
            return self.part.supply_max_v or self.pin.voltage
        if self.pin.voltage is not None:
            return self.pin.voltage
        return {LogicVoltage.V3V3: 3.3, LogicVoltage.V5: 5.0, LogicVoltage.BOTH: 5.0}.get(
            self.part.logic_voltage
        )


@dataclass
class CNet:
    name: str
    pins: list[CPin]

    @property
    def keys(self) -> list[str]:
        return [p.key for p in self.pins]

    def of_kind(self, *kinds: PinKind) -> list[CPin]:
        return [p for p in self.pins if p.kind in kinds]

    @property
    def power_v(self) -> tuple[float, CPin] | None:
        """The highest voltage a power_out pin puts on the net, and that pin."""
        sources = [(p.pin.voltage, p) for p in self.of_kind(PinKind.POWER_OUT) if p.pin.voltage]
        return max(sources, key=lambda s: s[0]) if sources else None

    @property
    def voltage(self) -> tuple[float, CPin] | None:
        """The net's voltage: from its power_out pins, else from the parts driving it."""
        if power := self.power_v:
            return power
        drivers = [(p.drive_v, p) for p in self.pins if p.is_signal and p.drive_v]
        return max(drivers, key=lambda s: s[0]) if drivers else None


@dataclass
class Context:
    design: Design
    nets: list[CNet]
    pins: dict[str, CPin] = field(default_factory=dict)
    net_of: dict[str, CNet] = field(default_factory=dict)

    @classmethod
    def build(cls, design: Design) -> "Context":
        pins = {
            f"{p.ref}.{pin.name}": CPin(f"{p.ref}.{pin.name}", p, pin)
            for p in design.placements
            for pin in p.part.pins
        }
        nets = [CNet(n.name, [pins[p.key] for p in n.pins]) for n in compute_nets(design)]
        net_of = {pin.key: net for net in nets for pin in net.pins}
        return cls(design, nets, pins, net_of)

    def wired(self, pin: CPin) -> bool:
        return pin.key in self.net_of

    def placement_pins(self, placement: Placement) -> list[CPin]:
        return [p for p in self.pins.values() if p.placement is placement]
