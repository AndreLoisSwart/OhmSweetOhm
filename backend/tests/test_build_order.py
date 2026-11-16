"""Build order (2026-11-16): build_step on placements, setting it, the suggestion, and
that revisions, the build sheet and MCP carry it."""

import pytest

from tests.test_mcp import ToolError, mcp  # noqa: F401  (mcp is a fixture)


def pin(name, kind="gpio", side="left", **fields):
    return {"name": name, "kind": kind, "side": side, **fields}


def part(api, name, kind, *pins):
    res = api.post("/api/parts", json={"name": name, "kind": kind, "pins": list(pins)})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
def bench(api):
    """An ESP32, a regulator, an OLED with its capacitor, a button, and an unwired LED."""
    esp = part(
        api,
        "ESP32",
        "board",
        pin("3V3", "power_out"),
        pin("GND", "ground"),
        pin("GPIO21"),
        pin("GPIO4"),
        pin("VIN", "power_in"),
    )
    reg = part(api, "Regulator", "power", pin("OUT", "power_out"), pin("GND", "ground"))
    oled = part(
        api, "OLED", "display", pin("VCC", "power_in"), pin("GND", "ground"), pin("SDA", "i2c_sda")
    )
    cap = part(api, "Capacitor", "passive", pin("1", "other"), pin("2", "other"))
    btn = part(api, "Button", "other", pin("A"), pin("B"))
    led = part(api, "LED", "actuator", pin("A"), pin("K"))
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    did = design["id"]
    placed = [
        {"part_id": esp["id"], "ref": "esp", "x": 0, "y": 0},
        {"part_id": reg["id"], "ref": "reg", "x": 0, "y": 300},
        {"part_id": oled["id"], "ref": "oled", "x": 400, "y": 200},
        {"part_id": cap["id"], "ref": "c1", "x": 600, "y": 200},
        {"part_id": btn["id"], "ref": "btn", "x": 400, "y": 0},
        {"part_id": led["id"], "ref": "led", "x": 0, "y": 600},
    ]
    assert api.post(f"/api/designs/{did}/placements", json={"parts": placed}).status_code == 200
    wires = [
        ("reg.OUT", "esp.VIN"),
        ("esp.3V3", "oled.VCC"),
        ("esp.GPIO21", "oled.SDA"),
        ("c1.1", "oled.VCC"),
        ("c1.2", "oled.GND"),
        ("btn.A", "esp.GPIO4"),
    ]
    res = api.post(
        f"/api/designs/{did}/wires", json={"wires": [{"a": a, "b": b} for a, b in wires]}
    )
    assert res.status_code == 200, res.text
    return res.json()


def steps(design) -> dict[str, int | None]:
    return {p["ref"]: p["build_step"] for p in design["placements"]}


def test_parts_start_unordered_and_take_a_step(api, bench):
    did = bench["id"]
    assert set(steps(bench).values()) == {None}
    oled = next(p for p in bench["placements"] if p["ref"] == "oled")
    out = api.patch(f"/api/designs/{did}/placements/{oled['id']}", json={"build_step": 2})
    assert steps(out.json())["oled"] == 2
    out = api.patch(f"/api/designs/{did}/placements/{oled['id']}", json={"build_step": None})
    assert steps(out.json())["oled"] is None
    bad = api.patch(f"/api/designs/{did}/placements/{oled['id']}", json={"build_step": 0})
    assert bad.status_code == 422


def test_set_build_order_changes_only_the_named_parts(api, bench):
    did = bench["id"]
    out = api.put(
        f"/api/designs/{did}/build-order",
        json={
            "steps": [
                {"ref": "esp", "step": 1},
                {"ref": "oled", "step": 3},
                {"ref": "c1", "step": 3},
            ]
        },
    ).json()
    assert steps(out) == {"esp": 1, "reg": None, "oled": 3, "c1": 3, "btn": None, "led": None}
    out = api.put(
        f"/api/designs/{did}/build-order", json={"steps": [{"ref": "OLED", "step": None}]}
    ).json()
    assert steps(out)["oled"] is None and steps(out)["c1"] == 3
    # All or none: an unknown ref changes nothing.
    res = api.put(
        f"/api/designs/{did}/build-order",
        json={"steps": [{"ref": "esp", "step": 5}, {"ref": "nope", "step": 1}]},
    )
    assert res.status_code == 404 and "nope" in res.json()["detail"]
    assert steps(api.get(f"/api/designs/{did}").json())["esp"] == 1


def test_suggestion(api, bench):
    out = api.get(f"/api/designs/{bench['id']}/build-order/suggestion").json()
    got = {s["ref"]: s["step"] for s in out["steps"]}
    # Board, then power, then wired parts top to bottom (btn above oled), the capacitor
    # with the OLED it serves, and the unwired LED last.
    assert got == {"esp": 1, "reg": 2, "btn": 3, "oled": 4, "c1": 4, "led": 5}
    # Nothing is saved.
    assert set(steps(api.get(f"/api/designs/{bench['id']}").json()).values()) == {None}


def test_undo_and_revisions_keep_the_order(api, mcp, bench):  # noqa: F811
    did = bench["id"]
    # Undo sends a snapshot (PUT /layout): it carries the steps.
    snapshot = {
        "placements": [
            {
                **{k: p[k] for k in ("ref", "part_id", "x", "y", "rotation", "note")},
                "build_step": 7 if p["ref"] == "esp" else None,
            }
            for p in bench["placements"]
        ],
        "wires": [],
    }
    assert steps(api.put(f"/api/designs/{did}/layout", json=snapshot).json())["esp"] == 7
    # Claude's change saves a revision of the design as it was, step included.
    mcp("set_build_order", design_id=did, steps={"esp": 0})
    revision = api.get(f"/api/designs/{did}/revisions").json()[0]
    out = api.post(f"/api/designs/{did}/revisions/{revision['id']}/restore").json()
    assert steps(out)["esp"] == 7


def test_mcp_build_order(mcp, bench):  # noqa: F811
    did = bench["id"]
    suggested = mcp("suggest_build_order", design_id=did)
    assert {s["ref"]: s["step"] for s in suggested["steps"]}["c1"] == 4
    view = mcp("set_build_order", design_id=did, steps={"esp": 1, "oled": 2, "c1": 2})
    assert {p["ref"]: p["build_step"] for p in view["parts"]}["c1"] == 2
    view = mcp("update_placement", design_id=did, ref="c1", build_step=0)
    assert {p["ref"]: p["build_step"] for p in view["parts"]}["c1"] is None
    revisions = mcp("list_revisions", design_id=did)["revisions"]
    assert revisions[0]["summary"] == "Set the build step of c1"
    assert revisions[1]["summary"] == "Set the build order of esp, oled, c1"
    with pytest.raises(ToolError, match="nope"):
        mcp("set_build_order", design_id=did, steps={"nope": 1})


def test_build_sheet_lists_parts_in_build_order(api, bench):
    did = bench["id"]
    order = [{"ref": "oled", "step": 2}, {"ref": "c1", "step": 2}, {"ref": "esp", "step": 1}]
    api.put(f"/api/designs/{did}/build-order", json={"steps": order})
    layout = api.post(f"/api/designs/{did}/layouts", json={"name": "v1"}).json()
    # Every part off the board (on a cable): enough for the parts list.
    off = [{"placement_id": p["id"], "on_board": False} for p in bench["placements"]]
    res = api.put(f"/api/layouts/{layout['id']}/parts", json={"parts": off})
    assert res.status_code == 200, res.text
    sheet = api.get(f"/api/layouts/{layout['id']}/build-sheet").json()
    assert [(p["ref"], p["step"]) for p in sheet["parts"]] == [
        ("esp", 1),
        ("c1", 2),
        ("oled", 2),
        ("btn", None),
        ("led", None),
        ("reg", None),
    ]
    assert sheet["steps"][-1].endswith("step by step in build order, testing each step")
    assert "## Parts (in build order)" in sheet["text"]
    assert "- [ ] Step 2: c1 (Capacitor): off the board" in sheet["text"]
