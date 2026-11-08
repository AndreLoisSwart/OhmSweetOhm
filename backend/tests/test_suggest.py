"""The pin assignment helper: suggested wires for a placed part."""

import pytest


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


def build(api, library, parts: dict[str, str], wires=()) -> int:
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    placed = [{"part_id": library[name]["id"], "ref": ref} for ref, name in parts.items()]
    api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed})
    if wires:
        res = api.post(
            f"/api/designs/{design['id']}/wires",
            json={"wires": [{"a": a, "b": b} for a, b in wires]},
        )
        assert res.status_code == 200, res.text
    return design["id"]


def suggest(api, design_id, ref, **params) -> dict:
    res = api.get(f"/api/designs/{design_id}/suggest-wiring", params={"ref": ref, **params})
    assert res.status_code == 200, res.text
    return res.json()


def pairs(out) -> dict[str, str]:
    return {w["a"]: w["b"] for w in out["wires"]}


ESP = "ESP32 DevKit V1 (30-pin)"


def test_i2c_sensor_on_esp32(api, library):
    design_id = build(api, library, {"esp": ESP, "bme": "BME280 breakout (4-pin)"})
    out = suggest(api, design_id, "bme")
    assert out["board"] == "esp"
    assert pairs(out) == {
        "bme.VIN": "esp.3V3",
        "bme.GND": "esp.GND",
        "bme.SCL": "esp.GPIO22",
        "bme.SDA": "esp.GPIO21",
    }
    assert out["unassigned"] == []


def test_second_i2c_sensor_shares_the_bus(api, library):
    design_id = build(
        api,
        library,
        {"esp": ESP, "bme": "BME280 breakout (4-pin)", "oled": "SSD1306 128×64 OLED (I2C)"},
        [("bme.SDA", "esp.GPIO21"), ("bme.SCL", "esp.GPIO22"), ("bme.GND", "esp.GND")],
    )
    out = suggest(api, design_id, "oled")
    got = pairs(out)
    assert got["oled.SDA"] == "esp.GPIO21" and got["oled.SCL"] == "esp.GPIO22"
    sda = next(w for w in out["wires"] if w["a"] == "oled.SDA")
    assert "shared with bme.SDA" in sda["reason"]
    # The other ground pin is free, so it's used rather than piling onto the first.
    assert got["oled.GND"] == "esp.GND2"


def test_signals_avoid_strapping_input_only_and_bus_pins(api, library):
    design_id = build(api, library, {"esp": ESP, "relay": "Relay module (1-channel, 5 V)"})
    out = suggest(api, design_id, "relay")
    to = pairs(out)["relay.IN"]
    board = next(p for p in library.values() if p["name"] == ESP)
    pins = {p["name"]: p for p in api.get(f"/api/parts/{board['id']}").json()["pins"]}
    chosen = pins[to.split(".")[1]]
    assert "strapping" not in chosen["flags"] and "input_only" not in chosen["flags"]
    assert not {"i2c_sda", "i2c_scl", "spi_sck", "spi_mosi", "spi_miso"} & set(chosen["functions"])
    # The relay wants 5 V, which the ESP32 board doesn't put out; NO, COM and NC are the
    # switched side (kind other): left alone.
    unassigned = {u["pin"]: u["reason"] for u in out["unassigned"]}
    assert set(unassigned) == {"relay.VCC", "relay.NO", "relay.COM", "relay.NC"}
    assert "4.5 V–5.5 V" in unassigned["relay.VCC"]


def test_supply_part_powers_what_the_board_cant(api, library):
    design_id = build(
        api, library, {"esp": ESP, "servo": "SG90 micro servo", "usb": "USB 5 V supply"}
    )
    out = suggest(api, design_id, "servo")
    assert pairs(out)["servo.V+"] == "usb.5V"


def test_five_volt_signal_into_a_three_volt_board_warns(api, library):
    design_id = build(api, library, {"esp": ESP, "sonar": "HC-SR04", "usb": "USB 5 V supply"})
    out = suggest(api, design_id, "sonar")
    echo = next(w for w in out["wires"] if w["a"] == "sonar.ECHO")
    assert "divider" in echo["warning"]
    trig = next(w for w in out["wires"] if w["a"] == "sonar.TRIG")
    assert trig["warning"] == ""  # TRIG is the sensor's input
    assert echo["b"] != trig["b"]


def test_wired_pins_and_taken_board_pins_are_skipped(api, library):
    design_id = build(
        api,
        library,
        {"uno": "Arduino Uno R3", "led": "LED (5 mm)", "pir": "PIR HC-SR501"},
        [("pir.OUT", "uno.D2")],
    )
    out = suggest(api, design_id, "pir")
    assert "pir.OUT" not in pairs(out)
    assert pairs(out)["pir.VCC"] == "uno.5V"
    # LED legs are kind other: no rule, wire them by hand.
    led = suggest(api, design_id, "led")
    assert led["wires"] == [] and len(led["unassigned"]) == 2


def test_uart_crosses_and_prefers_a_spare_port(api, library):
    api_part = api.post(
        "/api/parts",
        json={
            "name": "GPS",
            "kind": "module",
            "logic_voltage": "3v3",
            "pins": [
                {"name": "TX", "kind": "uart_tx", "side": "left"},
                {"name": "RX", "kind": "uart_rx", "side": "left"},
            ],
        },
    ).json()
    library["GPS"] = api_part
    design_id = build(api, library, {"esp": ESP, "gps": "GPS"})
    assert pairs(suggest(api, design_id, "gps")) == {"gps.TX": "esp.GPIO16", "gps.RX": "esp.GPIO17"}


def test_errors(api, library):
    design_id = build(api, library, {"bme": "BME280 breakout (4-pin)"})
    res = api.get(f"/api/designs/{design_id}/suggest-wiring", params={"ref": "bme"})
    assert res.status_code == 409 and "no board" in res.json()["detail"]
    res = api.get(f"/api/designs/{design_id}/suggest-wiring", params={"ref": "nope"})
    assert res.status_code == 404
