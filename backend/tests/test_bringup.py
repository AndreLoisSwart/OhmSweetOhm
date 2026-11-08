"""The bring-up sketch (build step 11): what it tests, what it drives, and that it compiles."""

import shutil
import subprocess
from pathlib import Path

import pytest

STUB = Path(__file__).parent / "arduino_stub"


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


def bringup(api, design_id: int, **params) -> dict:
    res = api.get(f"/api/designs/{design_id}/bringup", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def compiles(files: list[dict], tmp_path: Path, *defines: str) -> None:
    """Syntax-checks the sketch with g++ against a small Arduino stub."""
    if not shutil.which("g++"):
        pytest.skip("g++ isn't installed")
    for f in files:
        (tmp_path / f["filename"]).write_text(f["text"])
    result = subprocess.run(
        [
            "g++",
            "-std=c++17",
            "-fsyntax-only",
            "-Wall",
            "-Werror",
            "-x",
            "c++",
            f"-I{STUB}",
            f"-I{tmp_path}",
            *[f"-D{d}" for d in defines],
            str(tmp_path / "bringup.ino"),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


BENCH = {
    "esp": "ESP32 DevKit V1 (30-pin)",
    "bme": "BME280 breakout (4-pin)",
    "oled": "SSD1306 128×64 OLED (I2C)",
    "led": "LED (5 mm)",
    "btn": "Push button (4-leg tactile)",
    "pir": "PIR HC-SR501",
    "relay": "Relay module (1-channel, 5 V)",
}
BENCH_WIRES = [
    ("esp.GPIO21", "bme.SDA"),
    ("esp.GPIO22", "bme.SCL"),
    ("bme.SDA", "oled.SDA"),
    ("bme.SCL", "oled.SCL"),
    ("esp.GPIO4", "led.A"),
    ("esp.GND", "led.K"),
    ("esp.GPIO13", "btn.A1"),
    ("esp.GND", "btn.B1"),
    ("esp.GPIO27", "pir.OUT"),
    ("esp.GPIO26", "relay.IN"),
    ("esp.GPIO32", "relay.NO"),
]


def test_files_and_tests(api, library, tmp_path):
    out = bringup(api, build(api, library, BENCH, BENCH_WIRES))
    assert out["board"] == "esp" and out["boards"] == ["esp"]
    assert [f["filename"] for f in out["files"]] == ["bringup.ino", "pins.h"]
    sketch, pins_h = (f["text"] for f in out["files"])
    assert '#include "pins.h"' in sketch and "#pragma once" in pins_h
    # I2C parts on one bus, started from the design's pins on an ESP32.
    assert "Wire.begin(BME_SDA, BME_SCL);" in sketch
    assert "const uint8_t addresses[] = {0x76, 0x77};" in sketch
    assert "const uint8_t addresses[] = {0x3C, 0x3D};" in sketch
    assert "Wire1" not in sketch
    # Actuators blink; the button and the PIR are only read.
    assert "blink(LED_A);" in sketch and "blink(RELAY_IN);" in sketch
    assert "changes(BTN_A1, 5000)" in sketch and "changes(PIR_OUT, 5000)" in sketch
    assert "blink(BTN_A1)" not in sketch and "blink(PIR_OUT)" not in sketch
    # Ground isn't a signal.
    assert "LED_K" not in sketch
    compiles(out["files"], tmp_path, "ESP32")
    compiles(out["files"], tmp_path)


def test_order_is_i2c_then_blink_then_watch(api, library):
    design_id = build(api, library, BENCH, BENCH_WIRES)
    sketch = bringup(api, design_id)["files"][0]["text"]
    positions = [sketch.index(s) for s in ("// 1. I2C", "// 2. Actuators", "// 3. Inputs")]
    assert positions == sorted(positions)


def test_analog_spi_uart_and_skips(api, library, tmp_path):
    part = api.post(
        "/api/parts",
        json={
            "name": "Mic",
            "kind": "sensor",
            "pins": [{"name": "OUT", "kind": "analog", "side": "left"}],
        },
    ).json()
    lcd = api.post(
        "/api/parts",
        json={
            "name": "TFT",
            "kind": "display",
            "pins": [
                {"name": "SCK", "kind": "spi_sck", "side": "top"},
                {"name": "SDI", "kind": "spi_mosi", "side": "top"},
                {"name": "LED", "kind": "gpio", "side": "top"},
                {"name": "RESET", "kind": "reset", "side": "top"},
            ],
        },
    ).json()
    library |= {"Mic": part, "TFT": lcd}
    design_id = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "mic": "Mic", "lcd": "TFT", "led": "LED (5 mm)"},
        [
            ("esp.GPIO34", "mic.OUT"),
            ("esp.GPIO18", "lcd.SCK"),
            ("esp.GPIO23", "lcd.SDI"),
            ("esp.GPIO2", "lcd.LED"),
            ("esp.GPIO4", "lcd.RESET"),
            # An actuator on an input-only pin: never driven.
            ("esp.GPIO35", "led.A"),
        ],
    )
    out = bringup(api, design_id)
    sketch = out["files"][0]["text"]
    assert "analogRange(MIC_OUT, 3000);" in sketch
    assert "SKIP  lcd.SCK, lcd.SDI: SPI/UART, test with the part's library" in sketch
    # A display's other pins blink (the backlight shows it).
    assert "blink(LCD_LED);" in sketch and "blink(LCD_RESET);" in sketch
    assert "SKIP  led.A: esp.GPIO35 is input only" in sketch
    assert "blink(LED_A)" not in sketch
    assert "Wire.begin" not in sketch
    compiles(out["files"], tmp_path, "ESP32")


def test_a_shared_board_pin_is_never_driven(api, library):
    design_id = build(
        api,
        library,
        {
            "esp": "ESP32 DevKit V1 (30-pin)",
            "led": "LED (5 mm)",
            "btn": "Push button (4-leg tactile)",
        },
        [("esp.GPIO4", "led.A"), ("esp.GPIO4", "btn.A1")],
    )
    sketch = bringup(api, design_id)["files"][0]["text"]
    assert "SKIP  led.A: esp.GPIO4 is shared with btn" in sketch
    assert "blink(LED_A)" not in sketch


def test_two_i2c_buses_need_an_esp32(api, library, tmp_path):
    design_id = build(
        api,
        library,
        {
            "esp": "ESP32 DevKit V1 (30-pin)",
            "bme": "BME280 breakout (4-pin)",
            "oled": "SSD1306 128×64 OLED (I2C)",
        },
        [
            ("esp.GPIO21", "bme.SDA"),
            ("esp.GPIO22", "bme.SCL"),
            ("esp.GPIO25", "oled.SDA"),
            ("esp.GPIO26", "oled.SCL"),
        ],
    )
    out = bringup(api, design_id)
    sketch = out["files"][0]["text"]
    assert "Wire1.begin(OLED_SDA, OLED_SCL);" in sketch
    assert "i2cFound(Wire1, a)" in sketch
    assert "SKIP  oled: on a second I2C bus, which needs an ESP32" in sketch
    compiles(out["files"], tmp_path, "ESP32")
    compiles(out["files"], tmp_path)


def test_uno_uses_its_own_i2c_pins(api, library, tmp_path):
    design_id = build(
        api,
        library,
        {"uno": "Arduino Uno R3", "oled": "SSD1306 128×64 OLED (I2C)", "led": "LED (5 mm)"},
        [("uno.A4", "oled.SDA"), ("uno.SCL", "oled.SCL"), ("uno.D13", "led.A")],
    )
    out = bringup(api, design_id)
    sketch = out["files"][0]["text"]
    assert "Wire.begin();  // this board's own SDA and SCL pins" in sketch
    assert "blink(LED_A);" in sketch
    # Unwired pins are in pins.h, not repeated here.
    assert "led.K" not in sketch
    compiles(out["files"], tmp_path)


def test_i2c_part_without_both_bus_pins(api, library):
    design_id = build(
        api,
        library,
        {"esp": "ESP32 DevKit V1 (30-pin)", "bme": "BME280 breakout (4-pin)"},
        [("esp.GPIO21", "bme.SDA")],
    )
    sketch = bringup(api, design_id)["files"][0]["text"]
    assert "SKIP  bme: SDA and SCL aren't both on the board" in sketch


def test_nothing_to_test_and_errors(api, library, tmp_path):
    design_id = build(api, library, {"esp": "ESP32-C3 SuperMini"}, [])
    out = bringup(api, design_id)
    assert "Nothing to test" in out["files"][0]["text"]
    compiles(out["files"], tmp_path, "ESP32")
    empty = api.post("/api/designs", json={"name": "Empty"}).json()
    res = api.get(f"/api/designs/{empty['id']}/bringup")
    assert res.status_code == 409


def test_names_with_quotes_stay_valid_c(api, tmp_path):
    board = api.post(
        "/api/parts",
        json={
            "name": "Board",
            "kind": "board",
            "pins": [{"name": "GPIO5", "kind": "gpio", "side": "left"}],
        },
    ).json()
    odd = api.post(
        "/api/parts",
        json={
            "name": 'Odd "switch"',
            "kind": "other",
            "pins": [{"name": 'S"1', "kind": "gpio", "side": "left"}],
        },
    ).json()
    design = api.post("/api/designs", json={"name": 'Café "test"'}).json()
    api.post(
        f"/api/designs/{design['id']}/placements",
        json={"parts": [{"part_id": board["id"], "ref": "b"}, {"part_id": odd["id"], "ref": "s"}]},
    )
    api.post(f"/api/designs/{design['id']}/wires", json={"wires": [{"a": "b.GPIO5", "b": 's.S"1'}]})
    out = bringup(api, design["id"])
    assert 'Bring-up test: Caf? \\"test\\" on b' in out["files"][0]["text"]
    compiles(out["files"], tmp_path, "ESP32")
