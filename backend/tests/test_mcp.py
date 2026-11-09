"""Claude's tools (docs/mcp.md), called the way Claude does: over /mcp with the token."""

import pytest
from fastapi.testclient import TestClient

from app.modules.mcp import token

LAN = ("192.168.1.50", 50000)
HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


class ToolError(Exception):
    pass


@pytest.fixture
def mcp(api):
    """Calls an MCP tool; returns its result, or raises ToolError with the refusal."""
    with TestClient(api.app, client=LAN) as lan:
        auth = {**HEADERS, "authorization": f"Bearer {token.get_token()}"}

        def rpc(method, params=None):
            body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
            res = lan.post("/mcp", headers=auth, json=body)
            assert res.status_code == 200, res.text
            return res.json()["result"]

        def call(tool, /, **arguments):
            result = rpc("tools/call", {"name": tool, "arguments": arguments})
            text = result["content"][0]["text"] if result["content"] else ""
            if result.get("isError"):
                raise ToolError(text)
            content = result.get("structuredContent", text)
            return (
                content["result"]
                if isinstance(content, dict) and set(content) == {"result"}
                else content
            )

        call.rpc = rpc
        yield call


def pin(name, kind="gpio", side="left", **fields):
    return {"name": name, "kind": kind, "side": side, **fields}


BME_PINS = [
    pin("VIN", "power_in"),
    pin("GND", "ground"),
    pin("SCL", "i2c_scl"),
    pin("SDA", "i2c_sda"),
]
ESP_PINS = [
    pin("3V3", "power_out", voltage=3.3),
    pin("GND", "ground"),
    pin("GPIO21", functions=["i2c_sda"], side="right"),
    pin("GPIO22", functions=["i2c_scl"], side="right"),
]


def test_tool_list(mcp):
    tools = {t["name"]: t for t in mcp.rpc("tools/list")["tools"]}
    assert set(tools) == {
        "search_parts",
        "get_part",
        "create_part",
        "update_part",
        "append_part_notes",
        "set_footprint",
        "list_tags",
        "create_tag",
        "list_designs",
        "get_design",
        "create_design",
        "update_design",
        "append_design_description",
        "add_parts",
        "update_placement",
        "remove_placement",
        "connect",
        "update_wire",
        "disconnect",
        "check_design",
        "get_pin_map",
        "get_bringup_sketch",
        "get_platformio_project",
        "compare_pin_map",
        "get_wokwi_export",
        "suggest_wiring",
        "list_revisions",
        "restore_revision",
        "list_layouts",
        "create_layout",
        "get_layout",
        "check_layout",
        "place_on_board",
        "cut",
        "uncut",
        "add_jumpers",
        "remove_jumper",
        "propose_connectors",
        "add_connectors",
        "update_connector",
        "remove_connector",
        "cut_between_rows",
        "trim_dead_copper",
        "list_layout_revisions",
        "restore_layout_revision",
        "get_build_sheet",
    }
    # Nothing in the library can be deleted.
    assert not [name for name in tools if name.startswith("delete")]
    assert tools["get_design"]["annotations"]["readOnlyHint"] is True
    assert tools["remove_placement"]["annotations"]["destructiveHint"] is True
    assert "\n    " not in tools["create_part"]["description"]


def test_claudes_parts_start_unverified(mcp, api):
    part = mcp(
        "create_part", name="BME280", kind="sensor", pins=BME_PINS, notes_md="From the datasheet"
    )
    assert part["verified"] is False
    assert part["created_by"] == "claude"
    assert [p["name"] for p in part["pins"]] == ["VIN", "GND", "SCL", "SDA"]
    assert [p["name"] for p in mcp("search_parts", query="bme")["parts"]] == ["BME280"]
    assert mcp("search_parts", unverified_only=True)["parts"][0]["id"] == part["id"]


def test_pin_changes_unverify_and_cant_remove_pins(mcp, api):
    part = api.post(
        "/api/parts", json={"name": "BME280", "kind": "sensor", "pins": BME_PINS}
    ).json()
    assert part["verified"] is True
    # A field change leaves it verified.
    assert mcp("update_part", part_id=part["id"], description="Pressure")["verified"] is True
    pins = part["pins"]
    with pytest.raises(ToolError, match="can't be removed through MCP"):
        mcp("update_part", part_id=part["id"], pins=pins[:3])
    renamed = [{**p, "name": "VCC"} if p["name"] == "VIN" else p for p in pins]
    updated = mcp("update_part", part_id=part["id"], pins=[*renamed, pin("CSB")])
    assert updated["verified"] is False
    assert [p["name"] for p in updated["pins"]] == ["VCC", "GND", "SCL", "SDA", "CSB"]
    assert updated["pins"][0]["id"] == pins[0]["id"]


def test_notes_and_descriptions_are_only_added_to(mcp, api):
    part = api.post(
        "/api/parts", json={"name": "LED", "kind": "actuator", "notes_md": "Red."}
    ).json()
    noted = mcp("append_part_notes", part_id=part["id"], text="Use a 220 Ω resistor.")
    assert noted["notes_md"] == "Red.\n\nUse a 220 Ω resistor."
    design = mcp("create_design", name="Lamp")
    assert (
        mcp("append_design_description", design_id=design["id"], text="Desk lamp")["description_md"]
        == "Desk lamp"
    )
    tools = mcp.rpc("tools/list")["tools"]
    update_part = next(t for t in tools if t["name"] == "update_part")
    assert "notes_md" not in update_part["inputSchema"]["properties"]


def test_building_a_design_from_scratch(mcp, api):
    esp = mcp("create_part", name="ESP32", kind="board", pins=ESP_PINS)
    bme = mcp("create_part", name="BME280", kind="sensor", pins=BME_PINS, i2c_addresses=[0x76])
    design = mcp("create_design", name="Weather station")
    design = mcp(
        "add_parts",
        design_id=design["id"],
        parts=[{"part_id": esp["id"], "ref": "esp"}, {"part_id": bme["id"]}],
    )
    assert [p["ref"] for p in design["parts"]] == ["esp", "bme"]
    design = mcp(
        "connect",
        design_id=design["id"],
        wires=[
            {"a": "esp.3V3", "b": "bme.VIN"},
            {"a": "esp.GND", "b": "bme.GND"},
            {"a": "esp.GPIO21", "b": "bme.SDA"},
            {"a": "esp.GPIO22", "b": "bme.SCL"},
        ],
    )
    assert {n["name"] for n in design["nets"]} == {"3V3", "GND", "bme.SCL", "bme.SDA"}
    checks = mcp("check_design", design_id=design["id"])
    assert checks["summary"]["error"] == 0
    # Claude's parts are unverified: a warning each.
    assert [r["id"] for r in checks["results"] if r["severity"] == "warning"] == [
        "unverified_part",
        "unverified_part",
    ]
    # Every change saved a revision first, by Claude, saying what it did.
    history = mcp("list_revisions", design_id=design["id"])["revisions"]
    assert [r["summary"] for r in history] == [
        "Connected esp.3V3 to bme.VIN, esp.GND to bme.GND, esp.GPIO21 to bme.SDA and 1 more",
        "Added esp, BME280",
    ]
    assert {r["author"] for r in history} == {"claude"}
    # The app shows the same design.
    assert len(api.get(f"/api/designs/{design['id']}").json()["wires"]) == 4


def test_changing_and_undoing(mcp, api):
    esp = mcp("create_part", name="ESP32", kind="board", pins=ESP_PINS)
    bme = mcp("create_part", name="BME280", kind="sensor", pins=BME_PINS)
    d = mcp("create_design", name="Station")["id"]
    mcp(
        "add_parts",
        design_id=d,
        parts=[{"part_id": esp["id"], "ref": "esp"}, {"part_id": bme["id"], "ref": "bme"}],
    )
    mcp(
        "connect",
        design_id=d,
        wires=[{"a": "esp.GND", "b": "bme.GND"}, {"a": "esp.3V3", "b": "bme.VIN"}],
    )

    moved = mcp("update_placement", design_id=d, ref="bme", x=400, rotation=90, new_ref="sensor")
    sensor = next(p for p in moved["parts"] if p["ref"] == "sensor")
    assert (sensor["x"], sensor["rotation"]) == (400, 90)
    colored = mcp(
        "update_wire", design_id=d, a="sensor.GND", b="esp.GND", color="green", label="0 V"
    )
    assert ("green", "0 V") in [(w["color"], w["label"]) for w in colored["wires"]]
    assert len(mcp("disconnect", design_id=d, a="sensor.GND", b="esp.GND")["wires"]) == 1
    with pytest.raises(ToolError, match="aren't wired together"):
        mcp("disconnect", design_id=d, a="sensor.GND", b="esp.GND")
    removed = mcp("remove_placement", design_id=d, ref="sensor")
    assert [p["ref"] for p in removed["parts"]] == ["esp"] and removed["wires"] == []

    history = mcp("list_revisions", design_id=d)["revisions"]
    assert history[0]["summary"] == "Removed sensor and its 1 wire"
    assert history[1]["summary"] == "Disconnected sensor.GND from esp.GND"
    assert history[3]["summary"] == "Moved and rotated bme (now sensor)"
    # Undo the removal.
    restored = mcp("restore_revision", design_id=d, revision_id=history[0]["id"])
    assert sorted(p["ref"] for p in restored["parts"]) == ["esp", "sensor"]
    assert mcp("list_revisions", design_id=d)["revisions"][0]["author"] == "claude"


def test_refusals_explain_themselves(mcp):
    d = mcp("create_design", name="Empty")["id"]
    with pytest.raises(ToolError, match='No part "esp"'):
        mcp("remove_placement", design_id=d, ref="esp")
    with pytest.raises(ToolError, match="Design 999 not found"):
        mcp("get_design", design_id=999)
    with pytest.raises(ToolError):
        mcp("create_part", name="X", kind="sensor", pins=[pin("A B")])


def test_tags_and_listing(mcp):
    tag = mcp("create_tag", name="Garden")
    d = mcp("create_design", name="Waterer", tag_ids=[tag["id"]], shelf_project_id=12)
    assert d["tags"] == [{"id": tag["id"], "name": "Garden"}]
    listed = mcp("list_designs")["designs"]
    assert listed[0]["shelf_project_id"] == 12
    assert mcp("list_tags")["tags"][0]["design_count"] == 1


def test_placement_summaries():
    from app.modules.mcp.server import _placement_summary as summary

    assert summary("bme", "sensor", False, False, False) == "Renamed bme to sensor"
    assert summary("esp", None, True, False, False) == "Moved esp"
    assert summary("esp", None, True, True, True) == "Moved, rotated and changed the note of esp"


def test_schemas_are_written_out_in_full(mcp):
    """Some clients drop $defs: every type and allowed value is inline instead."""
    tools = {t["name"]: t for t in mcp.rpc("tools/list")["tools"]}
    for tool in tools.values():
        assert "$ref" not in str(tool["inputSchema"]), tool["name"]
    kind = tools["search_parts"]["inputSchema"]["properties"]["kind"]
    assert kind["type"] == "string" and "board" in kind["enum"]
    wire = tools["connect"]["inputSchema"]["properties"]["wires"]["items"]
    assert set(wire["properties"]) == {"a", "b", "color", "label"}
    assert "red" in wire["properties"]["color"]["enum"]
    pin = tools["create_part"]["inputSchema"]["properties"]["pins"]["items"]["properties"]
    assert {"name", "kind", "side", "functions", "flags", "voltage"} <= set(pin)
    assert "input_only" in pin["flags"]["items"]["enum"]


def test_lists_look_the_same_empty_or_full(mcp):
    assert mcp("list_designs") == {"designs": []}
    mcp("create_design", name="One")
    assert len(mcp("list_designs")["designs"]) == 1


def test_zero_unlinks_shelf_help(mcp, api):
    d = mcp("create_design", name="Waterer", shelf_project_id=12)["id"]
    assert mcp("update_design", design_id=d, shelf_project_id=0)["shelf_project_id"] is None
    part = api.post(
        "/api/parts", json={"name": "LED", "kind": "actuator", "shelf_item_id": 4}
    ).json()
    assert mcp("update_part", part_id=part["id"], shelf_item_id=0)["shelf_item_id"] is None


def test_get_pin_map(mcp, api):
    esp = api.post("/api/parts", json={"name": "ESP", "kind": "board", "pins": ESP_PINS}).json()
    bme = api.post(
        "/api/parts",
        json={"name": "BME", "kind": "sensor", "i2c_addresses": [0x76], "pins": BME_PINS},
    ).json()
    design = api.post("/api/designs", json={"name": "Weather"}).json()
    api.post(
        f"/api/designs/{design['id']}/placements",
        json={
            "parts": [{"part_id": esp["id"], "ref": "esp"}, {"part_id": bme["id"], "ref": "bme"}]
        },
    )
    api.post(
        f"/api/designs/{design['id']}/wires",
        json={"wires": [{"a": "esp.GPIO21", "b": "bme.SDA"}, {"a": "esp.GPIO22", "b": "bme.SCL"}]},
    )
    out = mcp("get_pin_map", design_id=design["id"])
    assert out["filename"] == "pins.h"
    assert "constexpr uint8_t BME_SDA = 21;  // esp.GPIO21" in out["text"]
    assert "BME_I2C_ADDR = 0x76" in out["text"]
    py = mcp("get_pin_map", design_id=design["id"], lang="py")
    assert "BME_SCL = 22" in py["text"]
    with pytest.raises(ToolError, match="no board"):
        empty = api.post("/api/designs", json={"name": "Empty"}).json()
        mcp("get_pin_map", design_id=empty["id"])


def test_get_bringup_sketch(mcp, api):
    esp = api.post("/api/parts", json={"name": "ESP", "kind": "board", "pins": ESP_PINS}).json()
    bme = api.post(
        "/api/parts",
        json={"name": "BME", "kind": "sensor", "i2c_addresses": [0x76], "pins": BME_PINS},
    ).json()
    design = api.post("/api/designs", json={"name": "Weather"}).json()
    api.post(
        f"/api/designs/{design['id']}/placements",
        json={
            "parts": [{"part_id": esp["id"], "ref": "esp"}, {"part_id": bme["id"], "ref": "bme"}]
        },
    )
    api.post(
        f"/api/designs/{design['id']}/wires",
        json={"wires": [{"a": "esp.GPIO21", "b": "bme.SDA"}, {"a": "esp.GPIO22", "b": "bme.SCL"}]},
    )
    out = mcp("get_bringup_sketch", design_id=design["id"])
    assert [f["filename"] for f in out["files"]] == ["bringup.ino", "pins.h"]
    assert "Wire.begin(BME_SDA, BME_SCL);" in out["files"][0]["text"]


def test_firmware_fields_from_claude_unverify(mcp, api):
    part = api.post("/api/parts", json={"name": "BME", "kind": "sensor"}).json()
    assert part["verified"] is True
    # Other fields leave it verified.
    assert mcp("update_part", part_id=part["id"], description="Weather")["verified"] is True
    libs = [{"spec": "adafruit/Adafruit BME280 Library@^2.2"}]
    out = mcp("update_part", part_id=part["id"], libraries=libs)
    assert out["verified"] is False
    assert out["libraries"] == [{"spec": "adafruit/Adafruit BME280 Library@^2.2", "platforms": []}]
    project = mcp("get_platformio_project", design_id=_one_board_design(api, part["id"]))
    assert "adafruit/Adafruit BME280 Library@^2.2" in project["files"][0]["text"]


def _one_board_design(api, part_id: int) -> int:
    esp = api.post(
        "/api/parts",
        json={
            "name": "ESP",
            "kind": "board",
            "platform": "espressif32",
            "platformio_board": "esp32dev",
            "pins": ESP_PINS,
        },
    ).json()
    design = api.post("/api/designs", json={"name": "W"}).json()
    api.post(
        f"/api/designs/{design['id']}/placements",
        json={"parts": [{"part_id": esp["id"], "ref": "esp"}, {"part_id": part_id, "ref": "bme"}]},
    )
    return design["id"]


def test_compare_pin_map_and_firmware_repo(mcp, api):
    part = api.post(
        "/api/parts",
        json={"name": "BME", "kind": "sensor", "i2c_addresses": [0x76], "pins": BME_PINS},
    ).json()
    design_id = _one_board_design(api, part["id"])
    api.post(
        f"/api/designs/{design_id}/wires", json={"wires": [{"a": "esp.GPIO21", "b": "bme.SDA"}]}
    )
    view = mcp("update_design", design_id=design_id, firmware_repo="~/code/weather")
    assert view["firmware_repo"] == "~/code/weather"
    drift = mcp("compare_pin_map", design_id=design_id, text="constexpr uint8_t BME_SDA = 22;")
    assert drift["up_to_date"] is False
    assert drift["changed"][0] == {
        "name": "BME_SDA",
        "in_file": "22",
        "in_design": "21",
        "comment": "esp.GPIO21",
    }
    assert mcp("update_design", design_id=design_id, firmware_repo="")["firmware_repo"] is None


def test_claude_sets_a_footprint(api, mcp):
    pins = [
        {"name": "VCC", "kind": "power_in", "side": "left"},
        {"name": "GND", "kind": "ground", "side": "left"},
        {"name": "SDA", "kind": "i2c_sda", "side": "right"},
        {"name": "SCL", "kind": "i2c_scl", "side": "right"},
    ]
    part = api.post("/api/parts", json={"name": "Mod", "kind": "sensor", "pins": pins}).json()
    out = mcp("set_footprint", part_id=part["id"], from_sides={"span_mm": 10.16})
    assert holes(out)["SDA"] == (10.16, 0) and out["verified"] is False
    out = mcp(
        "set_footprint",
        part_id=part["id"],
        holes=[{"pin": "vcc", "x_mm": 0, "y_mm": 0}, {"pin": "GND", "x_mm": 2.54, "y_mm": 0}],
        body_mm={"x": -1, "y": -1, "w": 5, "h": 2},
    )
    assert holes(out)["GND"] == (2.54, 0) and holes(out)["SDA"] == (None, None)
    with pytest.raises(ToolError, match="either"):
        mcp("set_footprint", part_id=part["id"])
    with pytest.raises(ToolError, match="no pin"):
        mcp("set_footprint", part_id=part["id"], holes=[{"pin": "X", "x_mm": 0, "y_mm": 0}])


def holes(part) -> dict:
    return {p["name"]: (p["x_mm"], p["y_mm"]) for p in part["pins"]}


def test_claude_lays_out_a_board(api, mcp):
    """Step 18 end to end: the Nano + LED + BME280 build on the user's stripboard."""
    assert api.post("/api/parts/starter").status_code == 200
    lib = {p["name"]: p["id"] for p in api.get("/api/parts").json()}
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    did = design["id"]
    api.post(
        f"/api/designs/{did}/placements",
        json={
            "parts": [
                {"part_id": lib["Arduino Nano"], "ref": "nano"},
                {"part_id": lib["LED (5 mm)"], "ref": "led"},
                {"part_id": lib["BME280 breakout (4-pin)"], "ref": "bme"},
            ]
        },
    )
    wires = [
        ("led.A", "nano.D2"),
        ("led.K", "nano.GND"),
        ("bme.VIN", "nano.3V3"),
        ("bme.GND", "nano.GND2"),
        ("bme.SCL", "nano.A5"),
        ("bme.SDA", "nano.A4"),
    ]
    api.post(f"/api/designs/{did}/wires", json={"wires": [{"a": a, "b": b} for a, b in wires]})

    layout = mcp("create_layout", design_id=did, name="Stripboard v1")
    lid = layout["id"]
    assert (layout["strips"], layout["holes"], layout["pitch_mm"]) == (24, 37, 2.54)
    assert [p["ref"] for p in layout["not_placed"]] == ["bme", "led", "nano"]

    layout = mcp(
        "place_on_board",
        layout_id=lid,
        parts=[
            {"ref": "nano", "at": "A1"},
            {"ref": "led", "at": "P10", "rotation": 90},
            {"ref": "bme", "off_board": True},
        ],
    )
    nano = next(p for p in layout["parts"] if p["ref"] == "nano")
    assert nano["pins"]["D13"] == "A1" and nano["mount"] == "socketed"
    assert any(c["id"] == "layout_short" for c in layout["checks"])
    # The picture: a ruler, a line per strip with its marks, and the legend.
    lines = layout["picture"].splitlines()
    assert lines[0].split()[:3] == ["1", "5", "10"]
    assert lines[1].startswith("A N n n") and "SHORT" in lines[1]
    assert "N = nano (socketed)" in layout["picture"]

    layout = mcp("cut_between_rows", layout_id=lid, ref="nano")
    assert not any(c["id"] == "layout_short" for c in layout["checks"])
    assert "x" in lines_of(layout)[1]

    layout = mcp(
        "add_jumpers",
        layout_id=lid,
        jumpers=[{"a": "K8", "b": "P8"}, {"a": "L12", "b": "Q12"}],
    )
    assert not any("led" in m for m in layout["missing"])

    proposals = mcp("propose_connectors", layout_id=lid)["connectors"]
    assert proposals == [
        {
            "for_part": "bme",
            "type": "header_female",
            "pins": ["bme.VIN", "bme.GND", "bme.SCL", "bme.SDA"],
            "why": "a header for a cable, in the part's own pin order",
        }
    ]
    layout = mcp(
        "add_connectors",
        layout_id=lid,
        connectors=[{"pins": proposals[0]["pins"], "at": "S2", "rotation": 90}],
    )
    assert layout["connectors"][0]["ref"] == "J1" and "1 = J1 at S2" in layout["picture"]
    layout = mcp(
        "add_jumpers",
        layout_id=lid,
        jumpers=[
            {"a": "B3", "b": "S3"},
            {"a": "N3", "b": "T3"},
            {"a": "I3", "b": "U3"},
            {"a": "H3", "b": "V3"},
        ],
    )
    check = mcp("check_layout", layout_id=lid)
    assert check["checks"] == [] and check["missing"] == []
    assert check["stats"]["jumpers"] == 6

    # Undoing and changing through the tools.
    layout = mcp("uncut", layout_id=lid, at=["A4"])
    assert "A4" not in layout["cuts"]
    layout = mcp("cut", layout_id=lid, at=["A4", "W5-6"])
    assert {"A4", "W5-6"} <= set(layout["cuts"])
    layout = mcp("remove_jumper", layout_id=lid, a="V3", b="H3")
    assert len(layout["jumpers"]) == 5
    layout = mcp("update_connector", layout_id=lid, ref="j1", at="S4")
    assert layout["connectors"][0]["at"] == "S4"
    revisions = mcp("list_layout_revisions", layout_id=lid)["revisions"]
    assert revisions[0]["summary"] == "Changed J1" and revisions[0]["author"] == "claude"
    assert any(r["summary"].startswith("Placed nano at A1") for r in revisions)
    restored = mcp("restore_layout_revision", layout_id=lid, revision_id=revisions[0]["id"])
    assert restored["connectors"][0]["at"] == "S2"

    with pytest.raises(ToolError, match="isn't a hole"):
        mcp("cut", layout_id=lid, at=["14C"])
    with pytest.raises(ToolError, match="neighbouring"):
        mcp("cut", layout_id=lid, at=["C9-12"])
    with pytest.raises(ToolError, match="Say where"):
        mcp("place_on_board", layout_id=lid, parts=[{"ref": "led"}])
    assert mcp("list_layouts", design_id=did)["layouts"][0]["name"] == "Stripboard v1"
    sheet = mcp("get_build_sheet", layout_id=lid)
    assert sheet["text"].startswith("# Build sheet: Bench: Stripboard v1")
    assert "- [ ] 1. A4" in sheet["text"]


def lines_of(layout) -> list[str]:
    return layout["picture"].splitlines()
