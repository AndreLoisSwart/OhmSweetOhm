"""Each rule in docs/checks.md: a small design that fires it, and one that doesn't."""

import itertools

import pytest

_names = itertools.count()


class Bench:
    """Builds a design through the API, one part at a time."""

    def __init__(self, api):
        self.api = api
        self.design = api.post("/api/designs", json={"name": "Bench"}).json()

    def part(self, ref, *pins, kind="module", logic="3v3", **fields):
        """Places a new part. Pins are names, or (name, kind) or (name, kind, extra fields)."""
        made = []
        for spec in pins:
            spec = (spec,) if isinstance(spec, str) else spec
            name = spec[0]
            pin_kind = spec[1] if len(spec) > 1 else "gpio"
            extra = spec[2] if len(spec) > 2 else {}
            made.append({"name": name, "kind": pin_kind, "side": "left", **extra})
        body = {"name": f"{ref}-{next(_names)}", "kind": kind, "logic_voltage": logic}
        part = self.api.post("/api/parts", json={**body, "pins": made, **fields}).json()
        assert "id" in part, part
        res = self.api.post(
            f"/api/designs/{self.design['id']}/placements",
            json={"parts": [{"part_id": part["id"], "ref": ref}]},
        )
        assert res.status_code == 200, res.text
        return part

    def wire(self, *pairs):
        res = self.api.post(
            f"/api/designs/{self.design['id']}/wires",
            json={"wires": [{"a": a, "b": b} for a, b in pairs]},
        )
        assert res.status_code == 200, res.text

    def results(self, check=None):
        found = self.api.get(f"/api/designs/{self.design['id']}/checks").json()["results"]
        return [r for r in found if check is None or r["id"] == check]


@pytest.fixture
def bench(api):
    return Bench(api)


SUPPLY_3V3 = ("OUT", "power_out", {"voltage": 3.3})
SUPPLY_5V = ("OUT", "power_out", {"voltage": 5})


def test_power_short(bench):
    bench.part("reg", SUPPLY_3V3, kind="power")
    bench.part("led", ("K", "ground"))
    bench.wire(("reg.OUT", "led.K"))
    [result] = bench.results("power_short")
    assert result["severity"] == "error"
    assert set(result["pins"]) == {"reg.OUT", "led.K"}


def test_no_power_short_into_a_supply_pin(bench):
    bench.part("reg", SUPPLY_3V3, kind="power")
    bench.part("bme", ("VIN", "power_in"))
    bench.wire(("reg.OUT", "bme.VIN"))
    assert bench.results("power_short") == []


def test_supply_clash_and_same_voltage_supplies(bench):
    bench.part("a", SUPPLY_5V, kind="power")
    bench.part("b", SUPPLY_3V3, kind="power")
    bench.part("c", SUPPLY_3V3, kind="power")
    bench.wire(("a.OUT", "b.OUT"))
    bench.wire(("b.OUT", "c.OUT"))
    clashes = bench.results("supply_clash")
    assert {frozenset(r["pins"]) for r in clashes} == {
        frozenset({"a.OUT", "b.OUT"}),
        frozenset({"a.OUT", "c.OUT"}),
    }
    [same] = bench.results("output_to_output")
    assert set(same["pins"]) == {"b.OUT", "c.OUT"} and same["severity"] == "warning"


def test_overvoltage_from_a_5v_part(bench):
    bench.part("uno", ("A4", "gpio"), kind="board", logic="5v")
    bench.part("bme", ("SDA", "i2c_sda"), logic="3v3")
    bench.wire(("uno.A4", "bme.SDA"))
    [result] = bench.results("overvoltage")
    assert result["message"].startswith("bme.SDA (3.3 V max) is on an I2C line pulled up to 5 V")
    assert result["pins"] == ["bme.SDA", "uno.A4"]


def test_no_overvoltage_for_5v_tolerant_or_matching_pins(bench):
    bench.part("uno", ("A4", "gpio"), ("A5", "gpio"), kind="board", logic="5v")
    bench.part("tol", ("SDA", "i2c_sda", {"flags": ["five_v_tolerant"]}), logic="3v3")
    bench.part("lcd", ("SDA", "i2c_sda"), logic="5v")
    bench.wire(("uno.A4", "tol.SDA"), ("uno.A5", "lcd.SDA"))
    assert bench.results("overvoltage") == []


def test_overvoltage_on_a_supply(bench):
    bench.part("usb", SUPPLY_5V, kind="power")
    bench.part("bme", ("VIN", "power_in"), supply_max_v=3.6)
    bench.wire(("usb.OUT", "bme.VIN"))
    [result] = bench.results("overvoltage")
    assert result["message"].startswith("bme.VIN (3.6 V max) is on a 5 V net")


def test_undervoltage_supply(bench):
    bench.part("reg", SUPPLY_3V3, kind="power")
    bench.part("relay", ("VCC", "power_in"), supply_min_v=4.5)
    bench.part("ok", ("VCC", "power_in"), supply_min_v=3)
    bench.wire(("reg.OUT", "relay.VCC"), ("reg.OUT", "ok.VCC"))
    [result] = bench.results("undervoltage_supply")
    assert result["pins"] == ["relay.VCC", "reg.OUT"]


def test_undervoltage_from_the_pins_own_voltage(bench):
    # No supply range on the part: the VCC pin's voltage (what it needs) is used.
    bench.part("reg", SUPPLY_3V3, kind="power")
    bench.part("relay", ("VCC", "power_in", {"voltage": 5}))
    bench.part("bme", ("VIN", "power_in", {"voltage": 3.3}))
    bench.wire(("reg.OUT", "relay.VCC"), ("reg.OUT", "bme.VIN"))
    [result] = bench.results("undervoltage_supply")
    assert result["message"] == "relay.VCC needs at least 5 V but gets 3.3 V from reg.OUT"


def test_no_ground(bench):
    bench.part("reg", SUPPLY_3V3, ("GND", "ground"), kind="power")
    bench.part("bme", ("VIN", "power_in"), ("GND", "ground"))
    bench.wire(("reg.OUT", "bme.VIN"))
    assert {r["pins"][0] for r in bench.results("no_ground")} == {"reg.GND", "bme.GND"}
    bench.wire(("reg.GND", "bme.GND"))
    assert bench.results("no_ground") == []


def test_unpowered_skips_boards(bench):
    bench.part("esp", ("VIN", "power_in"), kind="board")
    bench.part("bme", ("VIN", "power_in"), kind="sensor")
    [result] = bench.results("unpowered")
    assert result["pins"] == ["bme.VIN"]


def test_uart_crossed(bench):
    bench.part("a", ("TX", "uart_tx"), ("RX", "uart_rx"))
    bench.part("b", ("TX", "uart_tx"), ("RX", "uart_rx"))
    bench.wire(("a.TX", "b.RX"))
    assert bench.results("uart_crossed") == []
    bench.wire(("a.RX", "b.RX"))
    [result] = bench.results("uart_crossed")
    assert set(result["pins"]) == {"a.RX", "b.RX"}


def test_i2c_mismatch(bench):
    bench.part("esp", ("GPIO21", "gpio", {"functions": ["i2c_sda"]}), "GPIO4", kind="board")
    bench.part("bme", ("SCL", "i2c_scl"), ("SDA", "i2c_sda"))
    bench.part("oled", ("SCL", "i2c_scl"))
    # A GPIO whose usual role is SDA, wired to SCL: fires. A plain GPIO doesn't.
    bench.wire(("esp.GPIO21", "bme.SCL"), ("esp.GPIO4", "oled.SCL"))
    [result] = bench.results("i2c_mismatch")
    assert result["pins"] == ["esp.GPIO21", "bme.SCL"]


def test_sda_to_scl_by_kind(bench):
    bench.part("a", ("SDA", "i2c_sda"))
    bench.part("b", ("SCL", "i2c_scl"))
    bench.wire(("a.SDA", "b.SCL"))
    assert len(bench.results("i2c_mismatch")) == 1


def test_i2c_address_clash_and_pullups(bench):
    bench.part("esp", ("GPIO21", "gpio", {"functions": ["i2c_sda"]}), kind="board")
    bench.part("bme", ("SDA", "i2c_sda"), i2c_addresses=[0x76, 0x77])
    bench.part("bme2", ("SDA", "i2c_sda"), i2c_addresses=[0x76, 0x77])
    bench.part("oled", ("SDA", "i2c_sda"), i2c_addresses=[0x3C])
    bench.wire(("esp.GPIO21", "bme.SDA"), ("esp.GPIO21", "bme2.SDA"), ("esp.GPIO21", "oled.SDA"))
    [clash] = bench.results("i2c_address_clash")
    assert set(clash["pins"]) == {"bme.SDA", "bme2.SDA"}
    assert "0x76" in clash["message"]
    [note] = bench.results("i2c_pullups")
    assert note["severity"] == "note"


def test_flash_strapping_and_nc_pins(bench):
    bench.part(
        "esp",
        ("GPIO6", "gpio", {"flags": ["flash"]}),
        ("GPIO2", "gpio", {"flags": ["strapping"]}),
        "GPIO4",
        kind="board",
    )
    bench.part("led", "A", "B", ("X", "nc"))
    bench.wire(("esp.GPIO6", "led.A"), ("esp.GPIO2", "led.B"), ("esp.GPIO4", "led.X"))
    assert [r["pins"] for r in bench.results("flash_pin")] == [["esp.GPIO6"]]
    assert [r["pins"] for r in bench.results("strapping_pin")] == [["esp.GPIO2"]]
    assert [r["pins"] for r in bench.results("nc_connected")] == [["led.X"]]


def test_input_only_driven(bench):
    bench.part("esp", ("GPIO34", "analog", {"flags": ["input_only"]}), "GPIO35", kind="board")
    bench.part("sd", ("CS", "spi_cs"))
    bench.part("pot", ("WIPER", "analog"), kind="sensor")
    bench.wire(("esp.GPIO34", "sd.CS"))
    [result] = bench.results("input_only_driven")
    assert result["pins"] == ["esp.GPIO34", "sd.CS"]
    bench.wire(("esp.GPIO35", "pot.WIPER"))
    assert len(bench.results("input_only_driven")) == 1


def test_adc2_with_wifi(bench):
    bench.part("esp", ("GPIO25", "gpio", {"flags": ["adc2"]}), "GPIO32", kind="board")
    bench.part("pot", ("WIPER", "analog"), kind="sensor")
    bench.part("btn", ("OUT", "gpio"))
    bench.wire(("esp.GPIO25", "pot.WIPER"), ("esp.GPIO32", "btn.OUT"))
    [result] = bench.results("adc2_wifi")
    assert result["pins"] == ["esp.GPIO25", "pot.WIPER"]


def test_unverified_part(api, bench):
    part = bench.part("bme", ("VIN", "power_in"))
    assert bench.results("unverified_part") == []
    api.patch(f"/api/parts/{part['id']}", json={"verified": False})
    [result] = bench.results("unverified_part")
    assert result["severity"] == "warning" and "bme" in result["message"]


def test_floating_input(bench):
    bench.part("esp", ("EN", "enable"), ("RST", "reset"), "GPIO4", kind="board")
    bench.part("btn", "A")
    bench.wire(("esp.RST", "btn.A"))
    assert [r["pins"] for r in bench.results("floating_input")] == [["esp.EN"]]


def test_results_are_errors_first_and_counted_everywhere(api, bench):
    bench.part("reg", SUPPLY_3V3, ("EN", "enable"), kind="power")
    bench.part("led", ("K", "ground"))
    bench.wire(("reg.OUT", "led.K"))
    checks = api.get(f"/api/designs/{bench.design['id']}/checks").json()
    severities = [r["severity"] for r in checks["results"]]
    assert severities == sorted(severities, key=["error", "warning", "note"].index)
    assert checks["summary"] == {"error": 1, "warning": 0, "note": 1}
    detail = api.get(f"/api/designs/{bench.design['id']}").json()
    assert detail["checks"]["summary"] == checks["summary"]
    assert detail["check_summary"] == checks["summary"]
    [listed] = api.get("/api/designs").json()
    assert listed["check_summary"] == checks["summary"]


def test_an_empty_design_is_clean(api, bench):
    checks = api.get(f"/api/designs/{bench.design['id']}/checks").json()
    assert checks == {
        "design_id": bench.design["id"],
        "summary": {"error": 0, "warning": 0, "note": 0},
        "results": [],
    }


def test_ground_pins_of_a_part_are_one_net(api, bench):
    bench.part("esp", ("GND", "ground"), ("GND2", "ground"), SUPPLY_3V3, kind="board")
    bench.part("reg", ("OUT", "power_out", {"voltage": 5}), kind="power")
    # A supply wired to the second ground pin shorts to the first one too.
    bench.wire(("reg.OUT", "esp.GND2"))
    nets = api.get(f"/api/designs/{bench.design['id']}").json()["nets"]
    assert [n["pins"] for n in nets] == [["esp.GND", "esp.GND2", "reg.OUT"]]
    assert len(bench.results("power_short")) == 1


def test_tied_pins_join_and_unwired_ties_make_no_net(api, bench):
    bench.part(
        "board",
        ("3V3", "power_out", {"voltage": 3.3, "tie": "3V3"}),
        ("3V3_2", "power_out", {"voltage": 3.3, "tie": "3V3"}),
        ("GND", "ground"),
        ("GND2", "ground"),
        kind="board",
    )
    bench.part("bme", ("VIN", "power_in"), ("GND", "ground"))
    assert api.get(f"/api/designs/{bench.design['id']}").json()["nets"] == []
    bench.wire(("board.3V3_2", "bme.VIN"))
    [net] = api.get(f"/api/designs/{bench.design['id']}").json()["nets"]
    assert net == {"name": "3V3", "pins": ["bme.VIN", "board.3V3", "board.3V3_2"]}
    # Two supplies of one part, tied, aren't two supplies fighting.
    assert bench.results("output_to_output") == []


def test_a_swapped_bus_still_shows_its_address_clash_and_one_error_per_net(bench):
    bench.part(
        "esp",
        ("GPIO21", "gpio", {"functions": ["i2c_sda"]}),
        ("GPIO22", "gpio", {"functions": ["i2c_scl"]}),
        kind="board",
    )
    bench.part("bme", ("SDA", "i2c_sda"), ("SCL", "i2c_scl"), i2c_addresses=[0x76])
    bench.part("bme2", ("SDA", "i2c_sda"), ("SCL", "i2c_scl"), i2c_addresses=[0x76])
    # bme is wired the wrong way round; bme2 is right.
    bench.wire(
        ("esp.GPIO21", "bme.SCL"),
        ("esp.GPIO22", "bme.SDA"),
        ("esp.GPIO21", "bme2.SDA"),
        ("esp.GPIO22", "bme2.SCL"),
    )
    mismatches = bench.results("i2c_mismatch")
    assert len(mismatches) == 2  # one per net, not one per pair
    assert "SDA and SCL are wired together" in mismatches[0]["message"]
    [clash] = bench.results("i2c_address_clash")
    assert "bme, bme2" in clash["message"]
    assert len(bench.results("i2c_pullups")) == 1  # one bus


def test_i2c_overvoltage_speaks_of_pull_ups(bench):
    bench.part("uno", ("A4", "gpio", {"functions": ["i2c_sda"]}), kind="board", logic="5v")
    bench.part("bme", ("SDA", "i2c_sda"), logic="3v3")
    bench.wire(("uno.A4", "bme.SDA"))
    [result] = bench.results("overvoltage")
    assert (
        result["message"]
        == "bme.SDA (3.3 V max) is on an I2C line pulled up to 5 V by uno.A4's side"
    )
