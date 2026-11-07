"""The starter parts (build step 8): they load, and the checks read them correctly."""

import pytest

from app.modules.parts.starter import STARTER_PARTS


@pytest.fixture
def library(api):
    res = api.post("/api/parts/starter")
    assert res.status_code == 200, res.text
    return {p["name"]: p for p in api.get("/api/parts").json()}


def test_all_load_unverified_and_once(api, library):
    assert len(library) == len(STARTER_PARTS) == 22
    assert all(p["verified"] is False for p in library.values())
    again = api.post("/api/parts/starter").json()
    assert again["added"] == [] and len(again["skipped"]) == 22
    listed = api.get("/api/parts/starter").json()
    assert all(p["present"] for p in listed)


def test_only_missing_ones_are_added(api):
    api.post("/api/parts", json={"name": "led (5 mm)", "kind": "actuator"})
    res = api.post("/api/parts/starter").json()
    assert res["skipped"] == ["LED (5 mm)"] and len(res["added"]) == 21


def test_each_says_to_check_it(api, library):
    for part in library.values():
        detail = api.get(f"/api/parts/{part['id']}").json()
        assert "Check it against your board" in detail["notes_md"], part["name"]
        assert detail["created_by"] == "claude"


def build(api, library, parts: dict[str, str], wires: list[tuple[str, str]]):
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    placed = [{"part_id": library[name]["id"], "ref": ref} for ref, name in parts.items()]
    api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed})
    res = api.post(
        f"/api/designs/{design['id']}/wires",
        json={"wires": [{"a": a, "b": b} for a, b in wires]},
    )
    assert res.status_code == 200, res.text
    return res.json()


def ids(design, severity=None):
    return sorted(r["id"] for r in design["checks"]["results"] if severity in (None, r["severity"]))


def test_a_weather_station_wired_right_has_no_errors(api, library):
    design = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "bme": "BME280 breakout (4-pin)"},
        [
            ("esp.3V3", "bme.VIN"),
            ("esp.GND2", "bme.GND"),
            ("esp.GPIO21", "bme.SDA"),
            ("esp.GPIO22", "bme.SCL"),
        ],
    )
    assert ids(design, "error") == []
    # The board's two GND pins are one net.
    gnd = next(n for n in design["nets"] if n["name"] == "GND")
    assert gnd["pins"] == ["bme.GND", "esp.GND", "esp.GND2"]


def test_hc_sr04_echo_into_an_esp32_is_caught_but_trig_is_fine(api, library):
    design = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "sonar": "HC-SR04", "usb": "USB 5 V supply"},
        [
            ("usb.5V", "sonar.VCC"),
            ("usb.GND", "sonar.GND"),
            ("usb.GND", "esp.GND"),
            ("esp.GPIO5", "sonar.TRIG"),
            ("esp.GPIO18", "sonar.ECHO"),
        ],
    )
    over = [r for r in design["checks"]["results"] if r["id"] == "overvoltage"]
    assert [r["pins"] for r in over] == [["esp.GPIO18", "sonar.ECHO"]]


def test_a_5v_sensor_on_3v3_is_undervoltage(api, library):
    design = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "relay": "Relay module (1-channel, 5 V)"},
        [("esp.3V3", "relay.VCC"), ("esp.GND", "relay.GND")],
    )
    assert "undervoltage_supply" in ids(design)


def test_uno_sda_is_a4(api, library):
    design = build(
        api,
        library,
        {"uno": "Arduino Uno R3", "oled": "SSD1306 128×64 OLED (I2C)"},
        [("uno.A4", "oled.SDA"), ("uno.SCL", "oled.SCL")],
    )
    nets = {n["name"]: n["pins"] for n in design["nets"]}
    assert ["oled.SDA", "uno.A4", "uno.SDA"] in nets.values()
    assert ["oled.SCL", "uno.A5", "uno.SCL"] in nets.values()
    assert "i2c_mismatch" not in ids(design)


def test_a_button_joins_its_paired_legs(api, library):
    design = build(
        api,
        library,
        {"esp": "ESP32-C3 SuperMini", "btn": "Push button (4-leg tactile)"},
        [("esp.GPIO3", "btn.A1"), ("esp.GND", "btn.B2")],
    )
    nets = sorted(n["pins"] for n in design["nets"])
    assert ["btn.A1", "btn.A2", "esp.GPIO3"] in nets
    assert ["btn.B1", "btn.B2", "esp.GND"] in nets
