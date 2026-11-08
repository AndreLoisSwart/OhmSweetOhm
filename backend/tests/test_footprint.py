"""Footprints (build step 14): pin holes and body outlines in mm."""

import pytest

from app.modules.parts.footprint import from_sides
from app.modules.parts.models import PinSide

L, R, T, B = PinSide.LEFT, PinSide.RIGHT, PinSide.TOP, PinSide.BOTTOM


def test_from_sides_columns_and_rows():
    assert from_sides([L, L, R, R], 15.24) == [(0, 0), (0, 2.54), (15.24, 0), (15.24, 2.54)]
    # A single column or row needs no span.
    assert from_sides([L, L, L], None) == [(0, 0), (0, 2.54), (0, 5.08)]
    assert from_sides([B, B], None) == [(0, 0), (2.54, 0)]
    assert from_sides([T, B], 10) == [(0, 0), (0, 10)]
    assert from_sides([L, R], 7.62, pitch_mm=5.08) == [(0, 0), (7.62, 0)]
    with pytest.raises(ValueError, match="span_mm"):
        from_sides([L, R], None)
    with pytest.raises(ValueError, match="by hand"):
        from_sides([L, T], 10)


def module(api, **fields) -> dict:
    pins = [
        {"name": "VCC", "kind": "power_in", "side": "left"},
        {"name": "GND", "kind": "ground", "side": "left"},
        {"name": "SDA", "kind": "i2c_sda", "side": "right"},
        {"name": "SCL", "kind": "i2c_scl", "side": "right"},
    ]
    res = api.post("/api/parts", json={"name": "Mod", "kind": "sensor", "pins": pins, **fields})
    assert res.status_code == 201, res.text
    return res.json()


def holes(part) -> dict:
    return {p["name"]: (p["x_mm"], p["y_mm"]) for p in part["pins"]}


def test_generate_then_save(api):
    part = module(api)
    assert part["body_mm"] is None and holes(part)["VCC"] == (None, None)
    made = api.get(f"/api/parts/{part['id']}/footprint/from-sides", params={"span_mm": 10.16})
    assert made.status_code == 200, made.text
    out = made.json()
    assert {h["pin"]: (h["x_mm"], h["y_mm"]) for h in out["holes"]} == {
        "VCC": (0, 0),
        "GND": (0, 2.54),
        "SDA": (10.16, 0),
        "SCL": (10.16, 2.54),
    }
    assert out["body_mm"] == {"x": -1.27, "y": -1.27, "w": 12.7, "h": 5.08}
    # Not saved until sent.
    assert api.get(f"/api/parts/{part['id']}").json()["body_mm"] is None
    body = {"x": -2, "y": -3, "w": 14.2, "h": 9}
    saved = api.put(
        f"/api/parts/{part['id']}/footprint",
        json={"body_mm": body, "holes": [{**h} for h in out["holes"]]},
    ).json()
    assert saved["body_mm"] == body and holes(saved)["SCL"] == (10.16, 2.54)
    # Needs the span for two columns.
    res = api.get(f"/api/parts/{part['id']}/footprint/from-sides")
    assert res.status_code == 409 and "span_mm" in res.json()["detail"]


def test_footprint_rules(api):
    part = module(api)
    ids = {p["name"]: p["id"] for p in part["pins"]}
    url = f"/api/parts/{part['id']}/footprint"
    clash = api.put(
        url,
        json={
            "holes": [
                {"pin_id": ids["VCC"], "x_mm": 0, "y_mm": 0},
                {"pin_id": ids["GND"], "x_mm": 0, "y_mm": 0},
            ]
        },
    )
    assert clash.status_code == 409 and "same hole" in clash.json()["detail"]
    assert api.put(url, json={"holes": [{"pin_id": 999, "x_mm": 0, "y_mm": 0}]}).status_code == 404
    assert api.put(url, json={"body_mm": {"x": 0, "y": 0, "w": 0, "h": 5}}).status_code == 422
    # Pins left out get no hole; values are kept to 0.01 mm.
    saved = api.put(url, json={"holes": [{"pin_id": ids["VCC"], "x_mm": 1.23456, "y_mm": 0}]})
    assert holes(saved.json()) == {
        "VCC": (1.23, 0),
        "GND": (None, None),
        "SDA": (None, None),
        "SCL": (None, None),
    }
    # A pin needs both coordinates.
    res = api.post(
        "/api/parts",
        json={
            "name": "Half",
            "kind": "sensor",
            "pins": [{"name": "A", "kind": "gpio", "side": "left", "x_mm": 1}],
        },
    )
    assert res.status_code == 422


def test_pin_editor_keeps_holes_and_copy_carries_them(api):
    part = module(api)
    made = api.get(
        f"/api/parts/{part['id']}/footprint/from-sides", params={"span_mm": 10.16}
    ).json()
    api.put(f"/api/parts/{part['id']}/footprint", json=made)
    # The pin editor sends pins without holes: they keep theirs.
    pins = [
        {k: p[k] for k in ("id", "name", "kind", "side", "functions", "flags")}
        for p in part["pins"]
    ]
    pins[0]["name"] = "VIN"
    edited = api.put(f"/api/parts/{part['id']}/pins", json={"pins": pins}).json()
    assert holes(edited)["VIN"] == (0, 0) and holes(edited)["SCL"] == (10.16, 2.54)
    copy = api.post(f"/api/parts/{part['id']}/copy").json()
    assert holes(copy) == holes(edited) and copy["body_mm"] == edited["body_mm"]


def test_starter_footprints(api):
    api.post("/api/parts/starter")
    parts = {p["name"]: p for p in api.get("/api/parts").json()}
    nano = api.get(f"/api/parts/{parts['Arduino Nano']['id']}").json()
    assert holes(nano)["D13"] == (0, 0) and holes(nano)["D1"] == (15.24, 35.56)
    assert nano["body_mm"]["w"] == 18
    uno = api.get(f"/api/parts/{parts['Arduino Uno R3']['id']}").json()
    assert uno["body_mm"] is None  # its headers are off the 2.54 mm grid
    button = api.get(f"/api/parts/{parts['Push button (4-leg tactile)']['id']}").json()
    assert holes(button)["B2"] == (7.62, 5.08)


def test_starter_fills_a_footprint_only_where_there_is_none(api):
    led = api.post(
        "/api/parts",
        json={
            "name": "LED (5 mm)",
            "kind": "actuator",
            "pins": [
                {"name": "A", "kind": "other", "side": "bottom"},
                {"name": "K", "kind": "other", "side": "bottom"},
            ],
        },
    ).json()
    mine = api.post(
        "/api/parts",
        json={
            "name": "DHT22",
            "kind": "sensor",
            "pins": [{"name": "VCC", "kind": "power_in", "side": "left", "x_mm": 5, "y_mm": 5}],
        },
    ).json()
    api.post("/api/parts/starter")
    led = api.get(f"/api/parts/{led['id']}").json()
    assert holes(led) == {"A": (0, 0), "K": (2.54, 0)} and led["body_mm"] is not None
    mine = api.get(f"/api/parts/{mine['id']}").json()
    assert holes(mine) == {"VCC": (5, 5)} and mine["body_mm"] is None
