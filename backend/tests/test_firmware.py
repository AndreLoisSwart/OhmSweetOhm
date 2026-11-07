"""The pin map (build step 10): code names and `pins.h` / `pins.py` from a design."""

import pytest

from app.modules.parts.models import default_code_name


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


def build(api, library, parts: dict[str, str], wires: list[tuple[str, str]]) -> int:
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


def pin_map(api, design_id: int, **params):
    return api.get(f"/api/designs/{design_id}/pinmap", params=params)


WEATHER = {"esp": "ESP32 DevKit V1 (30-pin)", "bme": "BME280 breakout (4-pin)"}
WEATHER_WIRES = [
    ("esp.3V3", "bme.VIN"),
    ("esp.GND", "bme.GND"),
    ("esp.GPIO21", "bme.SDA"),
    ("esp.GPIO22", "bme.SCL"),
]


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("GPIO21", "21"),
        ("gpio05", "5"),
        ("D2", "2"),
        ("A0", "A0"),
        ("a7", "A7"),
        ("3V3", None),
        ("SDA", None),
        ("TX", None),
        ("DATA", None),
    ],
)
def test_code_name_rule(name, code):
    assert default_code_name(name) == code


def test_every_starter_board_pin_has_a_code_name_or_none_needed(api, library):
    """Signal pins on the starter boards all get one from the name rule, except pins
    tied to one that has (the Uno's SDA and SCL are A4 and A5)."""
    for part in library.values():
        if part["kind"] != "board":
            continue
        pins = api.get(f"/api/parts/{part['id']}").json()["pins"]
        coded_ties = {p["tie"] for p in pins if p["tie"] and p["default_code_name"]}
        for p in pins:
            if p["kind"] in {"gpio", "analog", "i2c_sda", "i2c_scl", "uart_tx", "uart_rx"}:
                assert p["default_code_name"] or p["tie"] in coded_ties, (part["name"], p)


def test_weather_station_header(api, library):
    design_id = build(api, library, WEATHER, WEATHER_WIRES)
    res = pin_map(api, design_id)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["filename"] == "pins.h" and out["board"] == "esp" and out["boards"] == ["esp"]
    text = out["text"]
    assert "#pragma once" in text
    assert "constexpr uint8_t BME_SDA = 21;  // esp.GPIO21" in text
    assert "constexpr uint8_t BME_SCL = 22;  // esp.GPIO22" in text
    assert "constexpr uint8_t BME_I2C_ADDR = 0x76;  // also 0x77" in text
    assert "constexpr uint8_t I2C_SDA = 21;" in text
    assert "constexpr uint8_t I2C_SCL = 22;" in text
    # Power pins aren't constants.
    assert "BME_VIN" not in text and "BME_GND" not in text
    # Starter parts are unverified until checked.
    assert "Unverified parts, check their pins first: bme, esp" in text
    # The same design gives the same text, so drift shows as a difference.
    assert pin_map(api, design_id).json()["text"] == text


def test_weather_station_micropython(api, library):
    design_id = build(api, library, WEATHER, WEATHER_WIRES)
    out = pin_map(api, design_id, lang="py").json()
    assert out["filename"] == "pins.py"
    assert "BME_SDA = 21  # esp.GPIO21" in out["text"]
    assert "BME_I2C_ADDR = 0x76  # also 0x77" in out["text"]
    assert "constexpr" not in out["text"] and "#pragma" not in out["text"]


def test_uno_pins_by_their_arduino_names_and_no_micropython(api, library):
    design_id = build(
        api,
        library,
        {"uno": "Arduino Uno R3", "oled": "SSD1306 128×64 OLED (I2C)", "led": "LED (5 mm)"},
        # SCL at the top of the board is tied to A5.
        [("uno.A4", "oled.SDA"), ("uno.SCL", "oled.SCL"), ("uno.D13", "led.A")],
    )
    text = pin_map(api, design_id).json()["text"]
    assert "constexpr uint8_t OLED_SDA = A4;  // uno.A4, also on uno.SDA" in text
    assert "constexpr uint8_t OLED_SCL = A5;  // uno.A5, also on uno.SCL" in text
    assert "constexpr uint8_t LED_A = 13;  // uno.D13" in text
    assert "led.K isn't wired" in text
    res = pin_map(api, design_id, lang="py")
    assert res.status_code == 409
    assert "OLED_SDA = A4" in res.json()["detail"]


def test_risky_board_pins_are_commented(api, library):
    design_id = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "sonar": "HC-SR04"},
        [("esp.GPIO5", "sonar.TRIG"), ("esp.GPIO34", "sonar.ECHO")],
    )
    text = pin_map(api, design_id).json()["text"]
    assert "SONAR_TRIG = 5;  // esp.GPIO5, strapping pin, affects boot" in text
    assert "SONAR_ECHO = 34;  // esp.GPIO34, input only" in text


def test_a_set_code_name_wins_and_blank_clears_it(api, library):
    part = api.post(
        "/api/parts",
        json={
            "name": "Odd board",
            "kind": "board",
            "pins": [
                {"name": "IO7", "kind": "gpio", "side": "left", "code_name": " LED_PIN "},
                {"name": "D3", "kind": "gpio", "side": "left", "code_name": "  "},
            ],
        },
    ).json()
    pins = {p["name"]: p for p in part["pins"]}
    assert pins["IO7"]["code_name"] == "LED_PIN" and pins["IO7"]["default_code_name"] is None
    assert pins["D3"]["code_name"] is None and pins["D3"]["default_code_name"] == "3"
    bad = api.post(
        "/api/parts",
        json={
            "name": "Bad",
            "kind": "board",
            "pins": [{"name": "X", "kind": "gpio", "side": "left", "code_name": "a b"}],
        },
    )
    assert bad.status_code == 422
    library["Odd board"] = part
    design_id = build(
        api,
        library,
        {"odd": "Odd board", "led": "LED (5 mm)", "btn": "Push button (4-leg tactile)"},
        [("odd.IO7", "led.A"), ("odd.D3", "btn.A1")],
    )
    text = pin_map(api, design_id).json()["text"]
    assert "LED_A = LED_PIN;  // odd.IO7" in text
    assert "BTN_A1 = 3;  // odd.D3" in text


def test_a_board_pin_without_a_code_name_is_noted(api, library):
    part = api.post(
        "/api/parts",
        json={
            "name": "Mystery board",
            "kind": "board",
            "pins": [{"name": "IO7", "kind": "gpio", "side": "left"}],
        },
    ).json()
    library["Mystery board"] = part
    design_id = build(
        api, library, {"m": "Mystery board", "led": "LED (5 mm)"}, [("m.IO7", "led.A")]
    )
    text = pin_map(api, design_id).json()["text"]
    assert "led.A: m.IO7 has no code name" in text


def test_choosing_the_board(api, library):
    no_board = build(api, library, {"bme": "BME280 breakout (4-pin)"}, [])
    res = pin_map(api, no_board)
    assert res.status_code == 409 and "no board" in res.json()["detail"]

    two = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "nano": "Arduino Nano"},
        [("esp.GPIO17", "nano.D0"), ("esp.GPIO16", "nano.D1")],
    )
    res = pin_map(api, two)
    assert res.status_code == 409 and "esp, nano" in res.json()["detail"]
    on_esp = pin_map(api, two, board="ESP").json()
    assert on_esp["board"] == "esp" and on_esp["boards"] == ["esp", "nano"]
    assert "NANO_D0 = 17;  // esp.GPIO17" in on_esp["text"]
    on_nano = pin_map(api, two, board="nano").json()["text"]
    assert "ESP_GPIO17 = 0;  // nano.D0" in on_nano
    assert pin_map(api, two, board="nope").status_code == 404


def test_nothing_wired_yet(api, library):
    design_id = build(api, library, {"esp": "ESP32-C3 SuperMini"}, [])
    assert "Nothing is wired to esp yet." in pin_map(api, design_id).json()["text"]


def test_pro_micro(api, library):
    design_id = build(
        api,
        library,
        {"pm": "Arduino Pro Micro (5 V)", "oled": "SSD1306 128×64 OLED (I2C)"},
        [("pm.D2", "oled.SDA"), ("pm.D3", "oled.SCL")],
    )
    text = pin_map(api, design_id).json()["text"]
    assert "OLED_SDA = 2;  // pm.D2" in text and "I2C_SCL = 3;" in text
