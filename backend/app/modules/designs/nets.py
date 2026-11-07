"""Nets: pins joined by wires, and by their part (ground pins, tied pins), by union-find.
Computed whenever read, never stored."""

from dataclasses import dataclass

from app.modules.designs.models import Design
from app.modules.parts.models import PinKind


@dataclass(frozen=True)
class NetPin:
    key: str  # `ref.PIN`
    kind: PinKind


@dataclass
class Net:
    name: str
    pins: list[NetPin]


# A net is named after the first of these it contains, else after its lowest `ref.PIN`.
NAMING_KINDS = (PinKind.POWER_OUT, PinKind.GROUND, PinKind.POWER_IN)


def compute_nets(design: Design) -> list[Net]:
    parent: dict[str, str] = {}
    pins: dict[str, NetPin] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def join(a: str, b: str) -> None:
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_a] = root_b

    wired: set[str] = set()
    for wire in design.wires:
        a = NetPin(f"{wire.a_placement.ref}.{wire.a_pin.name}", wire.a_pin.kind)
        b = NetPin(f"{wire.b_placement.ref}.{wire.b_pin.name}", wire.b_pin.kind)
        pins[a.key], pins[b.key] = a, b
        wired |= {a.key, b.key}
        join(a.key, b.key)

    # Pins joined inside a part: all its ground pins, and pins sharing a tie.
    for placement in design.placements:
        ties: dict[str, list[NetPin]] = {}
        for pin in placement.part.pins:
            group = "\0ground" if pin.kind == PinKind.GROUND else pin.tie
            if group:
                ties.setdefault(group, []).append(NetPin(f"{placement.ref}.{pin.name}", pin.kind))
        for members in ties.values():
            for member in members:
                pins.setdefault(member.key, member)
                join(members[0].key, member.key)

    groups: dict[str, list[NetPin]] = {}
    for key, pin in pins.items():
        groups.setdefault(find(key), []).append(pin)
    # A net needs a wire: pins only joined inside their part aren't one.
    groups = {root: members for root, members in groups.items() if wired & {p.key for p in members}}

    nets: list[Net] = []
    used: dict[str, int] = {}
    for members in groups.values():
        members.sort(key=lambda p: p.key.lower())
        name = members[0].key
        for kind in NAMING_KINDS:
            if named := next((p for p in members if p.kind == kind), None):
                name = named.key.split(".", 1)[1]
                break
        # Two separate GND nets: GND and GND_2.
        used[name] = used.get(name, 0) + 1
        if used[name] > 1:
            name = f"{name}_{used[name]}"
        nets.append(Net(name, members))
    return sorted(nets, key=lambda n: n.name.lower())
