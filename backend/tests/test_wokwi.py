"""Wokwi export: diagram.json and wokwi.toml from a design."""

import json

import pytest


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


def build(api, library, parts: dict[str, tuple[str, int, int]], wires) -> int:
    design = api.post("/api/designs", json={"name": "Sim"}).json()
    placed = [
        {"part_id": library[name]["id"], "ref": ref, "x": x, "y": y}
        for ref, (name, x, y) in parts.items()
    ]
    api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed})
    if wires:
        res = api.post(
            f"/api/designs/{design['id']}/wires",
            json={"wires": [{"a": a, "b": b, "color": c} for a, b, c in wires]},
        )
        assert res.status_code == 200, res.text
    return design["id"]


def export(api, design_id, **params) -> dict:
    res = api.get(f"/api/designs/{design_id}/wokwi", params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_esp32_design(api, library):
    design_id = build(
        api,
        library,
        {
            "esp": ("ESP32 DevKit V1 (30-pin)", 0, 0),
            "dht": ("DHT22", 400, 200),
            "bme": ("BME280 breakout (4-pin)", 400, 0),
        },
        [
            ("dht.DATA", "esp.GPIO4", "green"),
            ("dht.VCC", "esp.3V3", "red"),
            ("dht.GND", "esp.GND", "black"),
            ("bme.SDA", "esp.GPIO21", "blue"),
            ("bme.SCL", "esp.GPIO22", "yellow"),
        ],
    )
    out = export(api, design_id)
    assert out["board"] == "esp"
    files = {f["filename"]: f["text"] for f in out["files"]}
    assert set(files) == {"diagram.json", "wokwi.toml"}
    diagram = json.loads(files["diagram.json"])
    assert diagram["version"] == 1
    parts = {p["id"]: p for p in diagram["parts"]}
    assert parts["esp"]["type"] == "wokwi-esp32-devkit-v1"
    # Positions are scaled to Wokwi's smaller parts.
    assert (parts["dht"]["left"], parts["dht"]["top"]) == (200, 100)
    # Wokwi names the pins differently: D4, GND.2; the DHT22's data pin is SDA.
    assert diagram["connections"] == [
        ["esp:TX0", "$serialMonitor:RX", "", []],
        ["esp:RX0", "$serialMonitor:TX", "", []],
        ["dht:SDA", "esp:D4", "green", []],
        ["dht:VCC", "esp:3V3", "red", []],
        ["dht:GND", "esp:GND.2", "black", []],
    ]
    # No BME280 in Wokwi: left out, with its two wires.
    assert out["skipped"] == [{"ref": "bme", "part": "BME280 breakout (4-pin)", "wires": 2}]
    assert "firmware = '.pio/build/esp/firmware.bin'" in files["wokwi.toml"]


def test_code_name_fallback_and_avr_toml(api, library):
    design_id = build(
        api,
        library,
        {"uno": ("Arduino Uno R3", 0, 0), "led": ("LED (5 mm)", 100, 100)},
        [("led.A", "uno.D13", "orange"), ("led.K", "uno.GND2", "black")],
    )
    out = export(api, design_id)
    files = {f["filename"]: f["text"] for f in out["files"]}
    diagram = json.loads(files["diagram.json"])
    # D13 is 13 by its code name; no serial monitor wiring needed on AVR.
    assert diagram["connections"] == [
        ["led:A", "uno:13", "orange", []],
        ["led:C", "uno:GND.2", "black", []],
    ]
    assert "firmware.hex" in files["wokwi.toml"]
    assert out["skipped"] == []


def test_rotation_and_no_board(api, library):
    design = api.post("/api/designs", json={"name": "Loose"}).json()
    api.post(
        f"/api/designs/{design['id']}/placements",
        json={
            "parts": [{"part_id": library["SG90 micro servo"]["id"], "ref": "s", "rotation": 90}]
        },
    )
    out = export(api, design["id"])
    assert out["board"] is None and [f["filename"] for f in out["files"]] == ["diagram.json"]
    diagram = json.loads(out["files"][0]["text"])
    assert diagram["parts"][0]["rotate"] == 90


def test_two_boards_need_a_choice_for_the_toml(api, library):
    design_id = build(
        api,
        library,
        {"esp": ("ESP32 DevKit V1 (30-pin)", 0, 0), "uno": ("Arduino Uno R3", 500, 0)},
        [],
    )
    out = export(api, design_id)
    assert out["board"] is None and out["boards"] == ["esp", "uno"]
    assert [f["filename"] for f in out["files"]] == ["diagram.json"]
    chosen = export(api, design_id, board="uno")
    assert chosen["board"] == "uno" and len(chosen["files"]) == 2


def test_starter_fills_wokwi_names_on_existing_parts(api):
    api.post(
        "/api/parts",
        json={
            "name": "LED (5 mm)",
            "kind": "actuator",
            "pins": [
                {"name": "A", "kind": "other", "side": "bottom"},
                {"name": "K", "kind": "other", "side": "bottom"},
            ],
        },
    )
    out = api.post("/api/parts/starter").json()
    assert "LED (5 mm)" in out["updated"]
    led = next(p for p in api.get("/api/parts").json() if p["name"] == "LED (5 mm)")
    detail = api.get(f"/api/parts/{led['id']}").json()
    assert detail["wokwi_type"] == "wokwi-led"
    assert {p["name"]: p["wokwi_name"] for p in detail["pins"]} == {"A": None, "K": "C"}
