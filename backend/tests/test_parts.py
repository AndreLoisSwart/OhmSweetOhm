from datetime import datetime

import pytest


def make(api, name="BME280", **fields):
    res = api.post("/api/parts", json={"name": name, "kind": "sensor", **fields})
    assert res.status_code == 201, res.text
    return res.json()


def pin(name, kind="gpio", side="left", **fields):
    return {"name": name, "kind": kind, "side": side, **fields}


def names(part):
    return [(p["name"], p["side"], p["position"]) for p in part["pins"]]


def test_create_defaults(api):
    part = make(api)
    assert part["logic_voltage"] == "3v3"
    assert part["verified"] is True  # made by the user
    assert part["created_by"] == "user"
    assert part["pins"] == [] and part["pin_count"] == 0
    assert part["i2c_addresses"] == [] and part["datasheet_url"] == ""
    assert part["shelf_item_id"] is None and part["wokwi_type"] is None
    assert datetime.fromisoformat(part["created_at"]).utcoffset().total_seconds() == 0


def test_names_are_unique_ignoring_case(api):
    make(api, "BME280")
    res = api.post("/api/parts", json={"name": "bme280", "kind": "sensor"})
    assert res.status_code == 409
    assert res.json()["detail"] == 'A part named "BME280" already exists'


@pytest.mark.parametrize(
    "fields",
    [
        {"kind": "resistor"},
        {"logic_voltage": "12v"},
        {"i2c_addresses": [128]},
        {"supply_min_v": 5, "supply_max_v": 3.3},
        {"supply_max_v": 0},
        {"datasheet_url": "javascript:alert(1)"},
        {"tag_ids": "x"},
    ],
)
def test_invalid_fields_are_rejected(api, fields):
    res = api.post("/api/parts", json={"name": "X", "kind": "sensor", **fields})
    assert res.status_code == 422, fields


def test_i2c_addresses_keep_order_without_repeats(api):
    part = make(api, i2c_addresses=[0x77, 0x76, 0x77])
    assert part["i2c_addresses"] == [0x77, 0x76]


def test_pins_on_create_take_positions_from_order(api):
    part = make(
        api,
        pins=[
            pin("VIN", "power_in", voltage=3.3),
            pin("GND", "ground"),
            pin("OUT", side="right"),
            pin("SCL", "i2c_scl"),
        ],
    )
    assert names(part) == [
        ("VIN", "left", 0),
        ("GND", "left", 1),
        ("SCL", "left", 2),
        ("OUT", "right", 0),
    ]
    assert part["pin_count"] == 4


@pytest.mark.parametrize(
    "bad",
    [
        pin("GPIO 21"),  # space
        pin("esp.GND"),  # dot: pins are named ref.PIN
        pin(""),
        pin("X", "laser"),
        pin("X", side="middle"),
        pin("X", flags=["fragile"]),
        pin("X", voltage=-1),
    ],
)
def test_invalid_pins_are_rejected(api, bad):
    assert (
        api.post("/api/parts", json={"name": "X", "kind": "board", "pins": [bad]}).status_code
        == 422
    )


def test_pin_names_are_unique_ignoring_case(api):
    res = api.post(
        "/api/parts", json={"name": "X", "kind": "board", "pins": [pin("GND"), pin("gnd")]}
    )
    assert res.status_code == 422
    assert "Number repeats" in res.text


def test_functions_and_flags_lose_repeats(api):
    part = make(api, pins=[pin("GPIO2", functions=["analog", "analog"], flags=["adc2", "adc2"])])
    assert part["pins"][0]["functions"] == ["analog"]
    assert part["pins"][0]["flags"] == ["adc2"]


def test_pins_list_left_right_top_bottom(api):
    part = make(
        api, pins=[pin("B", side="bottom"), pin("T", side="top"), pin("R", side="right"), pin("L")]
    )
    assert [p["side"] for p in part["pins"]] == ["left", "right", "top", "bottom"]


def test_replace_pins_keeps_ids_and_renames(api):
    part = make(api, pins=[pin("VIN", "power_in"), pin("GND", "ground"), pin("SDA", "i2c_sda")])
    vin, gnd, sda = part["pins"]
    res = api.put(
        f"/api/parts/{part['id']}/pins",
        json={
            "pins": [
                {**sda, "side": "right"},
                {**vin, "name": "VCC"},
                pin("SCL", "i2c_scl"),
                # GND left out: removed.
            ]
        },
    )
    assert res.status_code == 200, res.text
    after = res.json()
    assert names(after) == [("VCC", "left", 0), ("SCL", "left", 1), ("SDA", "right", 0)]
    by_name = {p["name"]: p["id"] for p in after["pins"]}
    assert by_name["VCC"] == vin["id"] and by_name["SDA"] == sda["id"]
    assert gnd["id"] not in by_name.values()
    assert after["updated_at"] > part["updated_at"]


def test_replace_pins_can_swap_names(api):
    part = make(api, pins=[pin("A"), pin("B")])
    a, b = part["pins"]
    res = api.put(
        f"/api/parts/{part['id']}/pins",
        json={"pins": [{**a, "name": "B"}, {**b, "name": "A"}]},
    )
    assert res.status_code == 200, res.text
    assert {p["id"]: p["name"] for p in res.json()["pins"]} == {a["id"]: "B", b["id"]: "A"}


def test_replace_pins_refuses_another_parts_pin(api):
    other = make(api, "Other", pins=[pin("X")])
    part = make(api)
    res = api.put(
        f"/api/parts/{part['id']}/pins", json={"pins": [{**other["pins"][0], "name": "Y"}]}
    )
    assert res.status_code == 404
    assert api.get(f"/api/parts/{other['id']}").json()["pins"][0]["name"] == "X"


def test_partial_update(api):
    tag = api.post("/api/tags", json={"name": "I2C"}).json()
    part = make(api, supply_min_v=1.8, supply_max_v=3.6, shelf_item_id=12)
    res = api.patch(
        f"/api/parts/{part['id']}", json={"verified": False, "tag_ids": [tag["id"]]}
    ).json()
    assert res["verified"] is False
    assert res["tags"] == [{"id": tag["id"], "name": "I2C"}]
    assert res["shelf_item_id"] == 12
    res = api.patch(f"/api/parts/{part['id']}", json={"shelf_item_id": None}).json()
    assert res["shelf_item_id"] is None


def test_update_checks_supply_range_against_stored_values(api):
    part = make(api, supply_min_v=1.8, supply_max_v=3.6)
    assert api.patch(f"/api/parts/{part['id']}", json={"supply_min_v": 5}).status_code == 409


def test_non_clearable_fields_reject_null(api):
    part = make(api)
    for field in ("name", "kind", "logic_voltage", "notes_md", "verified", "tag_ids"):
        assert api.patch(f"/api/parts/{part['id']}", json={field: None}).status_code == 422, field


def test_filters(api):
    tag = api.post("/api/tags", json={"name": "I2C"}).json()
    bme = make(api, "BME280", description="Pressure and humidity", tag_ids=[tag["id"]])
    esp = make(api, "ESP32 DevKit", kind="board")
    api.patch(f"/api/parts/{esp['id']}", json={"verified": False})

    def listed(query=""):
        return [p["name"] for p in api.get(f"/api/parts{query}").json()]

    assert listed() == ["BME280", "ESP32 DevKit"]
    assert listed("?q=humid") == ["BME280"]
    assert listed("?kind=board") == ["ESP32 DevKit"]
    assert listed("?kind=board&kind=sensor") == ["BME280", "ESP32 DevKit"]
    assert listed(f"?tag_id={tag['id']}") == ["BME280"]
    assert listed("?verified=false") == ["ESP32 DevKit"]
    assert bme["id"]


def test_copy(api):
    part = make(api, pins=[pin("VIN", "power_in")], i2c_addresses=[0x76], shelf_item_id=3)
    api.patch(f"/api/parts/{part['id']}", json={"verified": False})
    copy = api.post(f"/api/parts/{part['id']}/copy").json()
    assert copy["name"] == "BME280 (copy)"
    assert copy["verified"] is True and copy["shelf_item_id"] is None
    assert names(copy) == names(part) and copy["pins"][0]["id"] != part["pins"][0]["id"]
    assert copy["i2c_addresses"] == [0x76]
    assert api.post(f"/api/parts/{part['id']}/copy").json()["name"] == "BME280 (copy 2)"


def test_delete(api):
    part = make(api, pins=[pin("VIN", "power_in")])
    assert api.delete(f"/api/parts/{part['id']}").status_code == 204
    assert api.get(f"/api/parts/{part['id']}").status_code == 404


def test_ties_are_kept_and_copied(api):
    part = make(
        api,
        pins=[pin("3V3", "power_out", tie=" 3V3 "), pin("3V3_2", "power_out", tie="3V3"), pin("A")],
    )
    assert [p["tie"] for p in part["pins"]] == ["3V3", "3V3", None]
    copy = api.post(f"/api/parts/{part['id']}/copy").json()
    assert [p["tie"] for p in copy["pins"]] == ["3V3", "3V3", None]
