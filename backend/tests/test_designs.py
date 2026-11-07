import pytest


def pin(name, kind="gpio", side="left", **fields):
    return {"name": name, "kind": kind, "side": side, **fields}


@pytest.fixture
def esp(api):
    pins = [
        pin("3V3", "power_out", voltage=3.3),
        pin("GND", "ground"),
        pin("GPIO21", functions=["i2c_sda"], side="right"),
        pin("GPIO22", functions=["i2c_scl"], side="right"),
    ]
    return api.post(
        "/api/parts", json={"name": "ESP32 DevKit", "kind": "board", "pins": pins}
    ).json()


@pytest.fixture
def bme(api):
    pins = [
        pin("VIN", "power_in"),
        pin("GND", "ground"),
        pin("SCL", "i2c_scl"),
        pin("SDA", "i2c_sda"),
    ]
    return api.post(
        "/api/parts", json={"name": "BME280 breakout", "kind": "sensor", "pins": pins}
    ).json()


@pytest.fixture
def design(api):
    return api.post("/api/designs", json={"name": "Weather station"}).json()


def place(api, design, *parts, **fields):
    res = api.post(
        f"/api/designs/{design['id']}/placements",
        json={"parts": [{"part_id": p["id"], **fields} for p in parts]},
    )
    assert res.status_code == 200, res.text
    return res.json()


def connect(api, design, *wires):
    return api.post(
        f"/api/designs/{design['id']}/wires",
        json={"wires": [w if isinstance(w, dict) else {"a": w[0], "b": w[1]} for w in wires]},
    )


def test_create_and_list(api, design):
    assert design["placements"] == [] and design["wires"] == [] and design["nets"] == []
    other = api.post("/api/designs", json={"name": "Plant waterer"}).json()
    api.patch(f"/api/designs/{design['id']}", json={"description_md": "Outdoors"})
    # Most recently changed first.
    assert [d["id"] for d in api.get("/api/designs").json()] == [design["id"], other["id"]]
    assert [d["name"] for d in api.get("/api/designs?q=outdoor").json()] == ["Weather station"]


def test_update_and_tags(api, design):
    tag = api.post("/api/tags", json={"name": "Garden"}).json()
    res = api.patch(
        f"/api/designs/{design['id']}", json={"tag_ids": [tag["id"]], "shelf_project_id": 7}
    ).json()
    assert res["tags"] == [{"id": tag["id"], "name": "Garden"}]
    assert res["shelf_project_id"] == 7
    assert api.get("/api/tags").json()[0]["design_count"] == 1
    assert [d["name"] for d in api.get(f"/api/designs?tag_id={tag['id']}").json()] == [
        "Weather station"
    ]
    assert api.patch(f"/api/designs/{design['id']}", json={"name": None}).status_code == 422


def test_refs_are_made_from_part_names(api, design, esp, bme):
    res = place(api, design, esp, bme, bme)
    assert [p["ref"] for p in res["placements"]] == ["esp", "bme", "bme2"]
    assert res["part_count"] == 3
    assert {p["name"] for p in res["parts"]} == {"ESP32 DevKit", "BME280 breakout"}


def test_new_parts_go_right_of_existing_ones_on_the_grid(api, design, esp, bme):
    res = place(api, design, esp, x=13, y=27)
    assert (res["placements"][0]["x"], res["placements"][0]["y"]) == (10, 30)
    res = place(api, design, bme)
    new = res["placements"][1]
    assert new["x"] > 10 and new["x"] % 10 == 0 and new["y"] == 0


@pytest.mark.parametrize("ref", ["1esp", "esp.1", "ESP-1", "a" * 21, ""])
def test_bad_refs_are_rejected(api, design, esp, ref):
    res = api.post(
        f"/api/designs/{design['id']}/placements",
        json={"parts": [{"part_id": esp["id"], "ref": ref}]},
    )
    assert res.status_code == 422


def test_refs_are_unique_and_lowercased(api, design, esp):
    res = place(api, design, esp, ref="MCU")
    assert res["placements"][0]["ref"] == "mcu"
    res = api.post(
        f"/api/designs/{design['id']}/placements",
        json={"parts": [{"part_id": esp["id"], "ref": "mcu"}]},
    )
    assert res.status_code == 409


def test_update_placement(api, design, esp, bme):
    res = place(api, design, esp, bme)
    esp_id, bme_id = (p["id"] for p in res["placements"])
    res = api.patch(
        f"/api/designs/{design['id']}/placements/{esp_id}",
        json={"x": 104, "rotation": 90, "ref": "mcu", "note": "USB faces up"},
    )
    placed = res.json()["placements"][0]
    assert (placed["x"], placed["rotation"], placed["ref"], placed["note"]) == (
        100,
        90,
        "mcu",
        "USB faces up",
    )
    bad = api.patch(f"/api/designs/{design['id']}/placements/{esp_id}", json={"rotation": 45})
    assert bad.status_code == 422
    taken = api.patch(f"/api/designs/{design['id']}/placements/{esp_id}", json={"ref": "bme"})
    assert taken.status_code == 409
    other = api.post("/api/designs", json={"name": "Other"}).json()
    assert (
        api.patch(f"/api/designs/{other['id']}/placements/{bme_id}", json={"x": 0}).status_code
        == 404
    )


def test_wires_by_ref_pin_and_default_colours(api, design, esp, bme):
    place(api, design, esp, bme)
    res = connect(
        api,
        design,
        ("esp.3V3", "bme.VIN"),
        ("esp.gnd", "bme.GND"),  # pin names match ignoring case
        ("esp.GPIO21", "bme.SDA"),
        {"a": "esp.GPIO22", "b": "bme.SCL", "color": "yellow", "label": "clock"},
    )
    assert res.status_code == 200, res.text
    wires = res.json()["wires"]
    assert [(w["a"], w["b"], w["color"]) for w in wires] == [
        ("esp.3V3", "bme.VIN", "red"),
        ("esp.GND", "bme.GND", "black"),
        ("esp.GPIO21", "bme.SDA", "blue"),
        ("esp.GPIO22", "bme.SCL", "yellow"),
    ]
    assert wires[3]["label"] == "clock"


@pytest.mark.parametrize(
    ("wires", "status"),
    [
        ([("esp.GND", "esp.gnd")], 409),  # pin to itself
        ([("esp.GND", "bme.GND"), ("bme.GND", "esp.GND")], 409),  # same pair, reversed
        ([("esp.GND", "nope.GND")], 404),
        ([("esp.GND", "bme.NOPE")], 404),
        ([("esp", "bme.GND")], 422),
    ],
)
def test_refused_wires_add_nothing(api, design, esp, bme, wires, status):
    place(api, design, esp, bme)
    assert connect(api, design, *wires).status_code == status
    assert api.get(f"/api/designs/{design['id']}").json()["wires"] == []


def test_duplicate_of_an_existing_wire_is_refused(api, design, esp, bme):
    place(api, design, esp, bme)
    connect(api, design, ("esp.GND", "bme.GND"))
    assert connect(api, design, ("bme.GND", "esp.GND")).status_code == 409


def test_a_pin_can_have_many_wires_and_nets_join(api, design, esp, bme):
    place(api, design, esp, bme, bme)
    res = connect(
        api,
        design,
        ("esp.3V3", "bme.VIN"),
        ("bme.VIN", "bme2.VIN"),
        ("esp.GND", "bme.GND"),
        ("esp.GPIO21", "bme.SDA"),
    ).json()
    nets = {n["name"]: n["pins"] for n in res["nets"]}
    assert nets == {
        "3V3": ["bme.VIN", "bme2.VIN", "esp.3V3"],
        "GND": ["bme.GND", "esp.GND"],
        # No power or ground pin: named after the lowest ref.PIN.
        "bme.SDA": ["bme.SDA", "esp.GPIO21"],
    }


def test_separate_nets_with_the_same_name_are_numbered(api, design, bme):
    place(api, design, bme, bme, bme, bme)
    res = connect(api, design, ("bme.GND", "bme2.GND"), ("bme3.GND", "bme4.GND")).json()
    assert sorted(n["name"] for n in res["nets"]) == ["GND", "GND_2"]


def test_update_and_remove_wire(api, design, esp, bme):
    place(api, design, esp, bme)
    wire = connect(api, design, ("esp.GND", "bme.GND")).json()["wires"][0]
    res = api.patch(f"/api/designs/{design['id']}/wires/{wire['id']}", json={"color": "green"})
    assert res.json()["wires"][0]["color"] == "green"
    assert (
        api.patch(
            f"/api/designs/{design['id']}/wires/{wire['id']}", json={"color": "pink"}
        ).status_code
        == 422
    )
    res = api.delete(f"/api/designs/{design['id']}/wires/{wire['id']}")
    assert res.json()["wires"] == [] and res.json()["nets"] == []


def test_removing_a_placement_removes_its_wires(api, design, esp, bme):
    res = place(api, design, esp, bme)
    bme_id = res["placements"][1]["id"]
    connect(api, design, ("esp.GND", "bme.GND"), ("esp.3V3", "bme.VIN"))
    res = api.delete(f"/api/designs/{design['id']}/placements/{bme_id}").json()
    assert [p["ref"] for p in res["placements"]] == ["esp"]
    assert res["wires"] == []
    assert res["parts"] == [res["parts"][0]] and res["parts"][0]["id"] == esp["id"]


def test_renaming_a_placement_renames_its_wire_ends(api, design, esp, bme):
    res = place(api, design, esp, bme)
    connect(api, design, ("esp.GND", "bme.GND"))
    res = api.patch(
        f"/api/designs/{design['id']}/placements/{res['placements'][0]['id']}", json={"ref": "mcu"}
    ).json()
    assert res["wires"][0]["a"] == "mcu.GND"


def test_a_placed_part_cant_be_deleted(api, design, bme):
    place(api, design, bme)
    res = api.delete(f"/api/parts/{bme['id']}")
    assert res.status_code == 409
    assert "Weather station" in res.json()["detail"]
    assert api.get(f"/api/parts/{bme['id']}").json()["used_in"] == [
        {"id": design["id"], "name": "Weather station"}
    ]


def test_a_wired_pin_cant_be_removed_but_can_be_renamed(api, design, esp, bme):
    place(api, design, esp, bme)
    connect(api, design, ("esp.GND", "bme.GND"))
    pins = api.get(f"/api/parts/{bme['id']}").json()["pins"]
    without_gnd = [p for p in pins if p["name"] != "GND"]
    res = api.put(f"/api/parts/{bme['id']}/pins", json={"pins": without_gnd})
    assert res.status_code == 409 and "GND" in res.json()["detail"]
    renamed = [{**p, "name": "G"} if p["name"] == "GND" else p for p in pins]
    assert api.put(f"/api/parts/{bme['id']}/pins", json={"pins": renamed}).status_code == 200
    assert api.get(f"/api/designs/{design['id']}").json()["wires"][0]["b"] == "bme.G"


def test_deleting_a_design_leaves_its_parts(api, design, bme):
    place(api, design, bme)
    assert api.delete(f"/api/designs/{design['id']}").status_code == 204
    assert api.get(f"/api/designs/{design['id']}").status_code == 404
    assert api.delete(f"/api/parts/{bme['id']}").status_code == 204
