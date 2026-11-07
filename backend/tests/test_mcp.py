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
        "list_revisions",
        "restore_revision",
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
    assert [p["name"] for p in mcp("search_parts", query="bme")] == ["BME280"]
    assert mcp("search_parts", unverified_only=True)[0]["id"] == part["id"]


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
    history = mcp("list_revisions", design_id=design["id"])
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

    history = mcp("list_revisions", design_id=d)
    assert history[0]["summary"] == "Removed sensor and its 1 wire"
    assert history[1]["summary"] == "Disconnected sensor.GND from esp.GND"
    assert history[3]["summary"] == "Moved and rotated bme (now sensor)"
    # Undo the removal.
    restored = mcp("restore_revision", design_id=d, revision_id=history[0]["id"])
    assert sorted(p["ref"] for p in restored["parts"]) == ["esp", "sensor"]
    assert mcp("list_revisions", design_id=d)[0]["author"] == "claude"


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
    listed = mcp("list_designs")
    assert listed[0]["shelf_project_id"] == 12
    assert mcp("list_tags")[0]["design_count"] == 1


def test_placement_summaries():
    from app.modules.mcp.server import _placement_summary as summary

    assert summary("bme", "sensor", False, False, False) == "Renamed bme to sensor"
    assert summary("esp", None, True, False, False) == "Moved esp"
    assert summary("esp", None, True, True, True) == "Moved, rotated and changed the note of esp"
