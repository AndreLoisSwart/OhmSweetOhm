"""Firmware link and drift check (build step 13)."""

import pytest


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


@pytest.fixture
def weather(api, library):
    design = api.post("/api/designs", json={"name": "Weather"}).json()
    parts = {"esp": "ESP32 DevKit V1 (30-pin)", "bme": "BME280 breakout (4-pin)"}
    placed = [{"part_id": library[name]["id"], "ref": ref} for ref, name in parts.items()]
    api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed})
    res = api.post(
        f"/api/designs/{design['id']}/wires",
        json={"wires": [{"a": "esp.GPIO21", "b": "bme.SDA"}, {"a": "esp.GPIO22", "b": "bme.SCL"}]},
    )
    return res.json()


def wire_id(design, a, b):
    return next(w["id"] for w in design["wires"] if {w["a"], w["b"]} == {a, b})


def compare(api, design_id, text, **extra):
    res = api.post(f"/api/designs/{design_id}/pinmap/compare", json={"text": text, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def test_firmware_repo_is_set_and_cleared(api):
    design = api.post(
        "/api/designs", json={"name": "Pet", "firmware_repo": " ~/code/pet-firmware "}
    ).json()
    assert design["firmware_repo"] == "~/code/pet-firmware"
    listed = api.get("/api/designs").json()[0]
    assert listed["firmware_repo"] == "~/code/pet-firmware"
    url = "https://github.com/me/pet-firmware"
    assert (
        api.patch(f"/api/designs/{design['id']}", json={"firmware_repo": url}).json()[
            "firmware_repo"
        ]
        == url
    )
    cleared = api.patch(f"/api/designs/{design['id']}", json={"firmware_repo": "  "}).json()
    assert cleared["firmware_repo"] is None
    bad = api.patch(f"/api/designs/{design['id']}", json={"firmware_repo": "a\nb"})
    assert bad.status_code == 422


def test_header_names_the_design(api, weather):
    text = api.get(f"/api/designs/{weather['id']}/pinmap").json()["text"]
    assert f"// Ohm Sweet Ohm design {weather['id']}, board esp." in text


def test_a_fresh_pin_map_is_up_to_date(api, weather):
    text = api.get(f"/api/designs/{weather['id']}/pinmap").json()["text"]
    drift = compare(api, weather["id"], text)
    assert drift["up_to_date"] is True
    assert drift["changed"] == drift["added"] == drift["removed"] == []
    assert drift["pin_map"]["text"] == text
    py = api.get(f"/api/designs/{weather['id']}/pinmap", params={"lang": "py"}).json()["text"]
    drift = compare(api, weather["id"], py)
    assert drift["up_to_date"] is True and drift["pin_map"]["filename"] == "pins.py"


def test_moved_added_and_removed_pins(api, library, weather):
    old = api.get(f"/api/designs/{weather['id']}/pinmap").json()["text"]
    design_id = weather["id"]
    # SDA moves from GPIO21 to GPIO25, an LED is added, SCL is unwired.
    api.delete(f"/api/designs/{design_id}/wires/{wire_id(weather, 'esp.GPIO21', 'bme.SDA')}")
    design = api.get(f"/api/designs/{design_id}").json()
    api.delete(f"/api/designs/{design_id}/wires/{wire_id(design, 'esp.GPIO22', 'bme.SCL')}")
    api.post(
        f"/api/designs/{design_id}/wires", json={"wires": [{"a": "esp.GPIO25", "b": "bme.SDA"}]}
    )
    api.post(
        f"/api/designs/{design_id}/placements",
        json={"parts": [{"part_id": library["LED (5 mm)"]["id"], "ref": "led"}]},
    )
    api.post(f"/api/designs/{design_id}/wires", json={"wires": [{"a": "esp.GPIO4", "b": "led.A"}]})

    drift = compare(api, design_id, old)
    assert drift["up_to_date"] is False
    changed = {c["name"]: (c["in_file"], c["in_design"]) for c in drift["changed"]}
    assert changed["BME_SDA"] == ("21", "25")
    assert changed["I2C_SDA"] == ("21", "25")
    assert {c["name"] for c in drift["added"]} == {"LED_A"}
    assert next(c for c in drift["added"])["comment"].startswith("esp.GPIO4")
    removed = {c["name"]: c["value"] for c in drift["removed"]}
    assert removed == {"BME_SCL": "22", "I2C_SCL": "22"}
    assert "LED_A = 4;" in drift["pin_map"]["text"]


def test_hand_written_defines_are_read_too(api, weather):
    text = "#define BME_SDA 21\n#define BME_SCL 23\n#define BME_I2C_ADDR 0X76\n"
    drift = compare(api, weather["id"], text)
    assert [c["name"] for c in drift["changed"]] == ["BME_SCL"]
    # Hex compares ignoring case; buses missing from a hand-written file show as added.
    assert {c["name"] for c in drift["added"]} == {"I2C_SDA", "I2C_SCL"}


def test_errors(api, weather):
    res = api.post(
        f"/api/designs/{weather['id']}/pinmap/compare", json={"text": "", "board": "nope"}
    )
    assert res.status_code == 404
    assert api.post("/api/designs/999/pinmap/compare", json={"text": ""}).status_code == 404
