"""Protoboard layouts (build step 15): geometry, board connectivity and the checks."""

import pytest

from app.core.db import get_session
from app.modules.layouts import service
from app.modules.layouts.board import label, parse_label, rotate, to_steps
from app.modules.layouts.schemas import CutIn


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


def design_with(api, library, parts: dict[str, str], wires=()) -> dict:
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    placed = [{"part_id": library[name]["id"], "ref": ref} for ref, name in parts.items()]
    out = api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed}).json()
    if wires:
        out = api.post(
            f"/api/designs/{design['id']}/wires",
            json={"wires": [{"a": a, "b": b} for a, b in wires]},
        ).json()
    return out


def new_layout(api, design, **fields) -> dict:
    res = api.post(f"/api/designs/{design['id']}/layouts", json={"name": "v1", **fields})
    assert res.status_code == 201, res.text
    return res.json()


def ids(design) -> dict[str, int]:
    return {p["ref"]: p["id"] for p in design["placements"]}


def ok(res) -> dict:
    assert res.status_code == 200, res.text
    return res.json()


def place(api, layout, design, **where) -> dict:
    """where: ref=(strip, hole[, rotation[, mount]]) or ref=None for off the board."""
    parts = []
    for ref, spot in where.items():
        if spot is None:
            parts.append({"placement_id": ids(design)[ref], "on_board": False})
            continue
        strip, hole, *rest = spot
        item = {"placement_id": ids(design)[ref], "strip": strip, "hole": hole}
        if rest:
            item["rotation"] = rest[0]
        if len(rest) > 1:
            item["mount"] = rest[1]
        parts.append(item)
    return ok(api.put(f"/api/layouts/{layout['id']}/parts", json={"parts": parts}))


def check_ids(layout, severity=None) -> list[str]:
    return [c["id"] for c in layout["checks"] if severity is None or c["severity"] == severity]


def pins_at(layout) -> dict[str, str]:
    return {p["key"]: p["at"] for part in layout["parts"] for p in part["pins"]}


# Geometry --------------------------------------------------------------------------------


def test_labels_and_geometry():
    assert label((3, 14)) == "C14" and label((24, 37)) == "X37" and label((27, 1)) == "AA1"
    assert parse_label(" c14 ") == (3, 14) and parse_label("AA1") == (27, 1)
    with pytest.raises(ValueError):
        parse_label("14C")
    assert rotate(2.54, 0, 90) == (-0, 2.54) and rotate(1, 2, 180) == (-1, -2)
    assert rotate(1, 2, 270) == (2, -1)
    assert to_steps(22.86) == 9 and to_steps(-5.08) == -2
    assert to_steps(6.5) is None and to_steps(2.6) == 1  # within 0.1 mm


def test_create_sizes(api, library):
    design = design_with(api, library, {"nano": "Arduino Nano"})
    layout = new_layout(api, design)
    assert (layout["board_type"], layout["strips"], layout["holes"]) == ("stripboard", 24, 37)
    assert [p["ref"] for p in layout["not_placed"]] == ["nano"]
    assert layout["checks"] == [] and layout["stats"]["not_placed"] == 1
    bb = new_layout(api, design, board_type="breadboard")
    assert (bb["strips"], bb["holes"]) == (14, 62)
    res = api.post(
        f"/api/designs/{design['id']}/layouts",
        json={"name": "x", "board_type": "breadboard", "strips": 20},
    )
    assert res.status_code == 409
    summaries = ok(api.get(f"/api/designs/{design['id']}/layouts"))
    assert [s["name"] for s in summaries] == ["v1", "v1"]


def test_placing_puts_pins_on_holes(api, library):
    design = design_with(api, library, {"nano": "Arduino Nano", "led": "LED (5 mm)"})
    layout = new_layout(api, design)
    layout = place(api, layout, design, nano=(1, 1), led=(16, 10, 90))
    at = pins_at(layout)
    # Left header down strips A–O at hole 1; right header 15.24 mm = 6 holes along.
    assert at["nano.D13"] == "A1" and at["nano.VIN"] == "O1"
    assert at["nano.D12"] == "A7" and at["nano.D1"] == "O7"
    # Turned a quarter: the LED's legs go across two strips.
    assert at["led.A"] == "P10" and at["led.K"] == "Q10"
    nano = next(p for p in layout["parts"] if p["ref"] == "nano")
    assert nano["mount"] == "socketed" and nano["at"] == "A1"
    led = next(p for p in layout["parts"] if p["ref"] == "led")
    assert led["mount"] == "soldered"
    # Without its footprint a part can't go on the board.
    design2 = design_with(api, library, {"uno": "Arduino Uno R3"})
    layout2 = new_layout(api, design2)
    res = api.put(
        f"/api/layouts/{layout2['id']}/parts",
        json={"parts": [{"placement_id": ids(design2)["uno"], "strip": 1, "hole": 1}]},
    )
    assert res.status_code == 409 and "footprint" in res.json()["detail"]
    assert layout2["not_placed"][0]["has_footprint"] is False


# The whole flow on the user's 24 × 37 stripboard ------------------------------------------


def test_a_real_layout_from_shorts_to_clean(api, library):
    design = design_with(
        api,
        library,
        {"nano": "Arduino Nano", "led": "LED (5 mm)", "bme": "BME280 breakout (4-pin)"},
        [
            ("led.A", "nano.D2"),
            ("led.K", "nano.GND"),
            ("bme.VIN", "nano.3V3"),
            ("bme.GND", "nano.GND2"),
            ("bme.SCL", "nano.A5"),
            ("bme.SDA", "nano.A4"),
        ],
    )
    layout = new_layout(api, design)
    lid = layout["id"]
    layout = place(api, layout, design, nano=(1, 1), led=(16, 10, 90), bme=None)

    # Both headers share strips A–O: every strip joins a left pin to a right one.
    shorts = [c for c in layout["checks"] if c["id"] == "layout_short"]
    assert len(shorts) >= 10
    # The copper carrying them is marked, for drawing.
    assert sum(s["short"] for s in layout["segments"]) >= len(shorts)
    strip_b = next(c for c in shorts if "nano.3V3" in c["pins"])
    assert "cut at B4" in strip_b["message"]
    # The LED's nets aren't joined to the Nano's yet: the ratsnest says where.
    missing = {c["net"] for c in layout["checks"] if c["id"] == "layout_missing"}
    assert "GND" in missing
    assert any({link["a"], link["b"]} == {"led.A", "nano.D2"} for link in layout["links"])
    # The BME280 is off the board, so its pins need a connector.
    off = next(c for c in layout["checks"] if c["id"] == "off_board_unconnected")
    assert set(off["pins"]) == {"bme.VIN", "bme.GND", "bme.SCL", "bme.SDA"}

    # Cut every strip between the headers.
    layout = ok(
        api.post(
            f"/api/layouts/{lid}/cuts",
            json={"cuts": [{"strip": s, "hole": 4} for s in range(1, 16)]},
        )
    )
    assert "layout_short" not in check_ids(layout)
    # Jumpers: D2's strip (K) to the LED's anode strip (P); GND2's strip (L) to the
    # cathode's (Q), clear of the LED's 5.8 mm body (holes 9–11 are under it).
    for a, b in (((11, 8), (16, 8)), ((12, 12), (17, 12))):
        layout = ok(
            api.post(
                f"/api/layouts/{lid}/jumpers",
                json={"a_strip": a[0], "a_hole": a[1], "b_strip": b[0], "b_hole": b[1]},
            )
        )
    assert not any(
        link["a"].startswith("led") or link["b"].startswith("led") for link in layout["links"]
    )

    # A 4-pin header for the BME280, across strips S–V.
    layout = ok(
        api.post(
            f"/api/layouts/{lid}/connectors",
            json={
                "pin_count": 4,
                "strip": 19,
                "hole": 2,
                "rotation": 90,
                "pins": ["bme.VIN", "bme.GND", "bme.SCL", "bme.SDA"],
            },
        )
    )
    j1 = layout["connectors"][0]
    assert j1["ref"] == "J1" and [p["strip"] for p in j1["pins"]] == [19, 20, 21, 22]
    assert "off_board_unconnected" not in check_ids(layout)
    # Its pins are on the board now, but not yet joined to the Nano's.
    assert {c["net"] for c in layout["checks"] if c["id"] == "layout_missing"} >= {"3V3"}
    for a, b in (((2, 3), (19, 3)), ((14, 3), (20, 3)), ((9, 3), (21, 3)), ((8, 3), (22, 3))):
        layout = ok(
            api.post(
                f"/api/layouts/{lid}/jumpers",
                json={"a_strip": a[0], "a_hole": a[1], "b_strip": b[0], "b_hole": b[1]},
            )
        )
    assert check_ids(layout, "error") == [], layout["checks"]
    assert check_ids(layout) == [], layout["checks"]
    stats = layout["stats"]
    assert (stats["on_board"], stats["off_board"], stats["jumpers"], stats["cuts"]) == (2, 1, 6, 15)
    assert stats["missing"] == 0 and layout["links"] == []
    # Strips carry their nets, for tinting.
    tints = {(s["a_strip"], s["a_hole"]): s["nets"] for s in layout["segments"] if s["nets"]}
    assert tints[(2, 1)] == ["3V3"]

    # The build sheet for it.
    sheet = ok(api.get(f"/api/layouts/{lid}/build-sheet"))
    assert sheet["errors"] == 0 and sheet["missing"] == 0
    # Cuts strip by strip, numbered; one per strip here, at hole 4.
    assert [c["at"] for c in sheet["cuts"]][:3] == ["A4", "B4", "C4"]
    assert sheet["cuts"][0]["number"] == 1
    j1 = sheet["jumpers"][0]
    assert (j1["a"], j1["b"], j1["holes"], j1["mm"], j1["cut_mm"]) == ("K8", "P8", 5, 12.7, 23)
    nano = next(p for p in sheet["parts"] if p["ref"] == "nano")
    assert (nano["at"], nano["mount"]) == ("A1", "socketed")
    assert sheet["parts"][-1] == {
        "ref": "bme",
        "part": "BME280 breakout (4-pin)",
        "at": None,
        "rotation": 0,
        "mount": "soldered",
        "on_board": False,
    }
    con = sheet["connectors"][0]
    assert con["serves"] == ["bme"] and con["straight"] is True
    assert con["pins"] == ["bme.VIN", "bme.GND", "bme.SCL", "bme.SDA"]
    assert "2 × 15-pin female header (sockets)" in sheet["shopping"]
    assert "1 × 4-pin female header (J1)" in sheet["shopping"]
    assert sheet["steps"][0].startswith("Turn the board over and make the 15 cuts")
    assert "- [ ] J1: 4-pin female header, pin 1 at S2 → bme" in sheet["text"]
    assert tints[(16, 1)] == [next(c for c in design["nets"] if "led.A" in c["pins"])["name"]]


# Copper rules -------------------------------------------------------------------------------


def two_leds(api, library) -> tuple[dict, dict]:
    design = design_with(api, library, {"a": "LED (5 mm)", "b": "LED (5 mm)"})
    return design, new_layout(api, design)


def test_bottom_links_touch_what_they_cross(api, library):
    design, layout = two_leds(api, library)
    lid = layout["id"]
    # Each LED across two strips: a on A–B at hole 2, b on D–E at hole 2.
    place(api, layout, design, a=(1, 2, 90), b=(4, 2, 90))
    bare = ok(
        api.post(
            f"/api/layouts/{lid}/jumpers",
            json={"a_strip": 1, "a_hole": 5, "b_strip": 4, "b_hole": 5, "side": "bottom"},
        )
    )
    # A bare link from A to D also lies across B and C: a.K (B) is joined to a.A (A).
    assert "layout_short" in check_ids(bare)
    jumper = bare["jumpers"][0]
    assert jumper["color"] == "gray" and jumper["length"] == 3
    sleeved = ok(api.patch(f"/api/layouts/{lid}/jumpers/{jumper['id']}", json={"insulated": True}))
    short = [c for c in sleeved["checks"] if c["id"] == "layout_short"]
    # Only its ends now: a.A (A) with b.A (D).
    assert len(short) == 1 and set(short[0]["pins"]) == {"a.A", "b.A"}
    gone = ok(api.delete(f"/api/layouts/{lid}/jumpers/{jumper['id']}"))
    assert gone["jumpers"] == [] and "layout_short" not in check_ids(gone)


def test_cut_between_and_at_a_pin(api, library):
    design, layout = two_leds(api, library)
    lid = layout["id"]
    # Both LEDs along strip A: a at A2–A3, b at A6–A7: four pins on one strip.
    layout = place(api, layout, design, a=(1, 2), b=(1, 6))
    assert "layout_short" in check_ids(layout)
    layout = ok(
        api.post(
            f"/api/layouts/{lid}/cuts",
            json={"cuts": [{"strip": 1, "hole": 2, "between": True}, {"strip": 1, "hole": 4}]},
        )
    )
    # A2 | A3 split a's legs; the cut at A4 splits a.K from b. b's own legs still share A6–A7.
    short = [c for c in layout["checks"] if c["id"] == "layout_short"]
    assert [set(c["pins"]) for c in short] == [{"b.A", "b.K"}]
    under = ok(api.post(f"/api/layouts/{lid}/cuts", json={"cuts": [{"strip": 1, "hole": 6}]}))
    assert "cut_under_pin" in check_ids(under)
    assert (
        api.post(f"/api/layouts/{lid}/cuts", json={"cuts": [{"strip": 1, "hole": 6}]}).status_code
        == 409
    )
    cut_id = under["cuts"][-1]["id"]
    assert "cut_under_pin" not in check_ids(ok(api.delete(f"/api/layouts/{lid}/cuts/{cut_id}")))
    off = api.post(f"/api/layouts/{lid}/cuts", json={"cuts": [{"strip": 30, "hole": 1}]})
    assert off.status_code == 409


def test_overlaps_edges_and_bodies(api, library):
    design = design_with(
        api,
        library,
        {"nano": "Arduino Nano", "led": "LED (5 mm)", "led2": "LED (5 mm)"},
    )
    layout = new_layout(api, design)
    lid = layout["id"]
    # led2 shares a hole with led; the Nano runs off the bottom edge.
    layout = place(api, layout, design, led=(20, 20), led2=(20, 21), nano=(15, 1))
    ids_ = check_ids(layout)
    assert "layout_overlap" in ids_ and "layout_off_edge" in ids_
    # An LED under the socketed Nano is fine; soldered flat, it's blocked.
    layout = place(api, layout, design, nano=(1, 1), led=(5, 3), led2=(20, 30))
    assert "under_body" not in check_ids(layout)
    layout = place(api, layout, design, nano=(1, 1, 0, "soldered"))
    assert "under_body" in check_ids(layout)
    # A top jumper end in a pin's hole.
    layout = ok(
        api.post(
            f"/api/layouts/{lid}/jumpers",
            json={"a_strip": 20, "a_hole": 30, "b_strip": 22, "b_hole": 32},
        )
    )
    assert "jumper_hole_taken" in check_ids(layout) and "diagonal_jumper" in check_ids(layout)
    same = api.post(
        f"/api/layouts/{lid}/jumpers",
        json={"a_strip": 1, "a_hole": 1, "b_strip": 1, "b_hole": 1},
    )
    assert same.status_code == 409


def test_footprint_change_is_noticed(api, library):
    design, layout = two_leds(api, library)
    layout = place(api, layout, design, a=(1, 2))
    led = library["LED (5 mm)"]
    part = ok(api.get(f"/api/parts/{led['id']}"))
    holes = [
        {
            "pin_id": p["id"],
            "x_mm": p["x_mm"],
            "y_mm": p["y_mm"] + (2.54 if p["name"] == "K" else 0),
        }
        for p in part["pins"]
    ]
    ok(
        api.put(
            f"/api/parts/{led['id']}/footprint", json={"body_mm": part["body_mm"], "holes": holes}
        )
    )
    layout = ok(api.get(f"/api/layouts/{layout['id']}"))
    assert "layout_out_of_date" in check_ids(layout)
    # Moving it (even in place) confirms the new footprint.
    layout = place(api, layout, design, a=(1, 2))
    assert "layout_out_of_date" not in check_ids(layout)


def test_breadboard_pattern(api, library):
    design, layout = two_leds(api, library)
    layout = new_layout(api, design, board_type="breadboard")
    lid = layout["id"]
    # Across rows 3–4: both in the same block of five, same column: shorted.
    layout = place(api, layout, design, a=(3, 5, 90), b=(10, 8, 90))
    short = [c for c in layout["checks"] if c["id"] == "layout_short"]
    assert {frozenset(c["pins"]) for c in short} == {
        frozenset({"a.A", "a.K"}),
        frozenset({"b.A", "b.K"}),
    }
    # Along a row instead: each leg in its own column.
    layout = place(api, layout, design, a=(3, 5, 0), b=(10, 8, 0))
    assert "layout_short" not in check_ids(layout)
    # Rails run the whole length.
    layout = place(api, layout, design, a=(1, 2, 0), b=(1, 20, 0))
    rail = [c for c in layout["checks"] if c["id"] == "layout_short"]
    assert len(rail) == 1 and set(rail[0]["pins"]) == {"a.A", "a.K", "b.A", "b.K"}
    cut = api.post(f"/api/layouts/{lid}/cuts", json={"cuts": [{"strip": 3, "hole": 4}]})
    assert cut.status_code == 409


# Connectors -------------------------------------------------------------------------------


def test_connector_rules(api, library):
    design = design_with(
        api,
        library,
        {"nano": "Arduino Nano", "bme": "BME280 breakout (4-pin)"},
        [("bme.SDA", "nano.A4")],
    )
    layout = new_layout(api, design)
    lid = layout["id"]
    url = f"/api/layouts/{lid}/connectors"
    layout = ok(api.post(url, json={"pin_count": 2, "pins": ["bme.SDA"]}))
    j1 = layout["connectors"][0]
    assert j1["at"] is None and [p["pin"] for p in j1["pins"]] == ["bme.SDA", None]
    assert {"connector_not_placed", "unassigned_connector_pin"} <= set(check_ids(layout))
    again = api.post(url, json={"pin_count": 1, "pins": ["bme.SDA"]})
    assert again.status_code == 409 and "J1" in again.json()["detail"]
    assert api.post(url, json={"pin_count": 1, "pins": ["bme.NOPE"]}).status_code == 404
    assert api.post(url, json={"pin_count": 1, "pins": ["a.B", "c.D"]}).status_code == 409
    j2 = ok(api.post(url, json={"pin_count": 2, "type": "screw_508", "strip": 5, "hole": 5}))
    screw = j2["connectors"][1]
    assert screw["ref"] == "J2" and [p["hole"] for p in screw["pins"]] == [5, 7]
    moved = ok(api.patch(f"{url}/{j1['id']}", json={"strip": 10, "hole": 10, "pin_count": 1}))
    j1 = moved["connectors"][0]
    assert j1["at"] == "J10" and [p["pin"] for p in j1["pins"]] == ["bme.SDA"]
    assert "unassigned_connector_pin" not in [
        c["id"] for c in moved["checks"] if "J1 " in c["message"]
    ]
    assert api.patch(f"{url}/{j1['id']}", json={"ref": "J2"}).status_code == 409
    gone = ok(api.delete(f"{url}/{screw['id']}"))
    assert [c["ref"] for c in gone["connectors"]] == ["J1"]


# Undo, revisions and the design changing ----------------------------------------------------


def test_snapshot_undo_and_revisions(api, library):
    design, layout = two_leds(api, library)
    lid = layout["id"]
    place(api, layout, design, a=(1, 2))
    before = ok(api.get(f"/api/layouts/{lid}"))
    after = ok(api.post(f"/api/layouts/{lid}/cuts", json={"cuts": [{"strip": 1, "hole": 9}]}))
    assert len(after["cuts"]) == 1
    # The canvas's undo sends the layout as it was.
    snapshot = {
        "parts": [
            {
                "placement_id": p["placement_id"],
                "ref": p["ref"],
                "on_board": p["on_board"],
                "strip": p["strip"],
                "hole": p["hole"],
                "rotation": p["rotation"],
                "mount": p["mount"],
            }
            for p in before["parts"]
        ],
    }
    undone = ok(api.put(f"/api/layouts/{lid}/snapshot", json=snapshot))
    assert undone["cuts"] == [] and pins_at(undone) == pins_at(before)
    # Claude's changes each save a revision first; restoring one saves the current state.
    session = next(api.app.dependency_overrides[get_session]())
    service.add_cuts(session, lid, [CutIn(strip=2, hole=9)], claude="Cut B9")
    revs = ok(api.get(f"/api/layouts/{lid}/revisions"))
    assert revs[0]["summary"] == "Cut B9" and revs[0]["author"] == "claude"
    assert len(ok(api.get(f"/api/layouts/{lid}"))["cuts"]) == 1
    restored = ok(api.post(f"/api/layouts/{lid}/revisions/{revs[0]['id']}/restore"))
    assert restored["cuts"] == [] and pins_at(restored) == pins_at(before)
    assert ok(api.get(f"/api/layouts/{lid}/revisions"))[0]["summary"].startswith("Before restoring")


def test_design_changes_flow_through(api, library):
    design, layout = two_leds(api, library)
    lid = layout["id"]
    place(api, layout, design, a=(1, 2, 90), b=(5, 2, 90))
    # A new wire in the schematic: missing on the board.
    api.post(f"/api/designs/{design['id']}/wires", json={"wires": [{"a": "a.K", "b": "b.A"}]})
    layout = ok(api.get(f"/api/layouts/{lid}"))
    assert "layout_missing" in check_ids(layout)
    link = layout["links"][0]
    assert {link["a"], link["b"]} == {"a.K", "b.A"}
    # Removing a placement takes it off its layouts.
    api.delete(f"/api/designs/{design['id']}/placements/{ids(design)['b']}")
    layout = ok(api.get(f"/api/layouts/{lid}"))
    assert [p["ref"] for p in layout["parts"]] == ["a"]
    assert ok(api.delete(f"/api/layouts/{lid}/parts/{ids(design)['a']}"))["parts"] == []
    # Deleting the design deletes its layouts.
    api.delete(f"/api/designs/{design['id']}")
    assert api.get(f"/api/layouts/{lid}").status_code == 404


def test_update_and_delete(api, library):
    design, layout = two_leds(api, library)
    lid = layout["id"]
    out = ok(api.patch(f"/api/layouts/{lid}", json={"name": "Stripboard v2", "notes": "Lid"}))
    assert (out["name"], out["notes"]) == ("Stripboard v2", "Lid")
    assert api.patch(f"/api/layouts/{lid}", json={"name": None}).status_code == 422
    assert api.delete(f"/api/layouts/{lid}").status_code == 204
    assert api.get(f"/api/layouts/{lid}").status_code == 404


# Helpers (step 17) --------------------------------------------------------------------------


def test_cut_between_rows_and_trim(api, library):
    design = design_with(api, library, {"nano": "Arduino Nano", "led": "LED (5 mm)"})
    layout = new_layout(api, design)
    lid = layout["id"]
    nano = ids(design)["nano"]
    # Rows at holes 1 and 7 share strips A–O. The LED stands across strips T and U.
    layout = place(api, layout, design, nano=(1, 1), led=(20, 5, 90))
    cut = ok(api.post(f"/api/layouts/{lid}/parts/{nano}/cut-between-rows"))
    assert "layout_short" not in check_ids(cut)
    holes = {(c["strip"], c["hole"], c["between"]) for c in cut["cuts"]}
    assert (1, 4, False) in holes  # midway between holes 1 and 7
    # RST and RST2 (strip M) are joined inside the Nano: no cut needed there.
    assert not any(s == 13 for s, _, _ in holes)
    again = api.post(f"/api/layouts/{lid}/parts/{nano}/cut-between-rows")
    assert again.status_code == 409
    # Trim: each used strip is cut just past its outer connections, between holes.
    trimmed = ok(api.post(f"/api/layouts/{lid}/trim"))
    new = {(c["strip"], c["hole"], c["between"]) for c in trimmed["cuts"]} - holes
    assert (1, 7, True) in new  # strip A past the Nano's right row
    assert (20, 4, True) in new and (20, 5, True) in new  # the LED's leg, both sides
    assert not any(s == 22 for s, _, _ in new)  # an empty strip stays whole
    assert api.post(f"/api/layouts/{lid}/trim").status_code == 409
    bb = new_layout(api, design, board_type="breadboard")
    assert api.post(f"/api/layouts/{bb['id']}/trim").status_code == 409


# Hole pitch ---------------------------------------------------------------------------------


def test_other_pitches(api, library):
    design = design_with(api, library, {"nano": "Arduino Nano", "led": "LED (5 mm)"})
    assert new_layout(api, design)["pitch_mm"] == 2.54
    fine = new_layout(api, design, pitch_mm=2.0)
    lid = fine["id"]
    # The Nano's 2.54 mm headers don't land on 2.0 mm holes.
    layout = place(api, fine, design, nano=(1, 1))
    off = next(c for c in layout["checks"] if c["id"] == "off_grid")
    assert "2 mm grid" in off["message"]
    # Only pins that happen to fall within 0.1 mm of a hole land: D13 at 0, 5V at 27.94.
    assert {p["key"] for p in layout["parts"][0]["pins"]} == {"nano.D13", "nano.5V"}
    # A header doesn't fit either; a part made for this pitch does.
    layout = ok(
        api.post(f"/api/layouts/{lid}/connectors", json={"pin_count": 2, "strip": 5, "hole": 5})
    )
    assert "connector_off_grid" in check_ids(layout)
    assert layout["connectors"][0]["pins"][0]["strip"] is None
    part = api.post(
        "/api/parts",
        json={
            "name": "Fine pitch",
            "kind": "module",
            "pins": [
                {"name": "A", "kind": "gpio", "side": "left", "x_mm": 0, "y_mm": 0},
                {"name": "B", "kind": "gpio", "side": "left", "x_mm": 0, "y_mm": 4.0},
            ],
        },
    ).json()
    d2 = design_with(api, {"Fine pitch": part}, {"m": "Fine pitch"})
    l2 = new_layout(api, d2, pitch_mm=2.0)
    l2 = place(api, l2, d2, m=(1, 1))
    assert pins_at(l2) == {"m.A": "A1", "m.B": "C1"}
    # Changing a board's pitch re-reads its parts: on 2.54 the 4 mm spacing is off grid.
    l2 = ok(api.patch(f"/api/layouts/{l2['id']}", json={"pitch_mm": 2.54}))
    assert "off_grid" in check_ids(l2)
    # Screw terminals are two holes apart on a standard board.
    std = new_layout(api, design)
    std = ok(
        api.post(
            f"/api/layouts/{std['id']}/connectors",
            json={"pin_count": 2, "type": "screw_508", "strip": 3, "hole": 3},
        )
    )
    assert [p["hole"] for p in std["connectors"][0]["pins"]] == [3, 5]
    # A breadboard pattern is always 2.54 mm.
    bad = api.post(
        f"/api/designs/{design['id']}/layouts",
        json={"name": "x", "board_type": "breadboard", "pitch_mm": 2.0},
    )
    assert bad.status_code == 409
    bb = new_layout(api, design, board_type="breadboard")
    assert api.patch(f"/api/layouts/{bb['id']}", json={"pitch_mm": 2.0}).status_code == 409
    assert api.patch(f"/api/layouts/{lid}", json={"pitch_mm": 0.5}).status_code == 422
