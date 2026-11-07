from datetime import timedelta

import pytest

from app.core.db import utcnow
from app.modules.designs import revisions


def pin(name, kind="gpio"):
    return {"name": name, "kind": kind, "side": "left"}


@pytest.fixture
def clock(monkeypatch):
    """Moves revisions' clock forward, past the quiet time that starts an editing session."""

    class Clock:
        offset = timedelta()

        def later(self, minutes=11):
            self.offset += timedelta(minutes=minutes)

    clock = Clock()
    monkeypatch.setattr(revisions, "utcnow", lambda: utcnow() + clock.offset)
    return clock


@pytest.fixture
def setup(api):
    bme = api.post(
        "/api/parts",
        json={
            "name": "BME280",
            "kind": "sensor",
            "pins": [pin("VIN", "power_in"), pin("GND", "ground")],
        },
    ).json()
    design = api.post("/api/designs", json={"name": "Station"}).json()
    base = f"/api/designs/{design['id']}"
    api.post(f"{base}/placements", json={"parts": [{"part_id": bme["id"]}, {"part_id": bme["id"]}]})
    return api, base, bme


def history(api, base):
    return api.get(f"{base}/revisions").json()


def test_a_session_starts_with_a_revision_after_quiet(setup, clock):
    api, base, _ = setup
    assert history(api, base) == []  # a fresh design's first edits are one session
    clock.later()
    api.post(f"{base}/wires", json={"wires": [{"a": "bme.GND", "b": "bme2.GND"}]})
    api.post(f"{base}/wires", json={"wires": [{"a": "bme.VIN", "b": "bme2.VIN"}]})
    [revision] = history(api, base)
    assert revision["author"] == "user"
    assert revision["summary"] == "Before editing on the canvas"
    # It holds the design as it was before the session: two parts, no wires.
    assert (revision["part_count"], revision["wire_count"]) == (2, 0)
    clock.later()
    api.delete(f"{base}/wires/{api.get(base).json()['wires'][0]['id']}")
    assert len(history(api, base)) == 2


def test_restore_saves_the_current_state_first(setup, clock):
    api, base, _ = setup
    clock.later()
    api.post(f"{base}/wires", json={"wires": [{"a": "bme.GND", "b": "bme2.GND"}]})
    [before] = history(api, base)
    res = api.post(f"{base}/revisions/{before['id']}/restore")
    assert res.status_code == 200
    assert res.json()["wires"] == []
    newest = history(api, base)[0]
    assert newest["summary"] == "Before restoring an earlier version"
    assert newest["wire_count"] == 1
    # And that restore can be undone.
    res = api.post(f"{base}/revisions/{newest['id']}/restore").json()
    assert [(w["a"], w["b"]) for w in res["wires"]] == [("bme.GND", "bme2.GND")]


def test_layout_keeps_placement_ids_by_ref(setup):
    api, base, bme = setup
    design = api.get(base).json()
    ids = {p["ref"]: p["id"] for p in design["placements"]}
    res = api.put(
        f"{base}/layout",
        json={
            "placements": [
                {"ref": "bme", "part_id": bme["id"], "x": 100, "y": 50, "rotation": 90},
                {"ref": "extra", "part_id": bme["id"], "x": 400, "y": 0},
            ],
            "wires": [
                {"a": "bme.VIN", "b": "extra.VIN", "color": "red"},
                {"a": "bme.NOPE", "b": "extra.GND", "color": "black"},  # left out
            ],
        },
    ).json()
    placed = {p["ref"]: p for p in res["placements"]}
    assert set(placed) == {"bme", "extra"}
    assert placed["bme"]["id"] == ids["bme"]
    assert (placed["bme"]["x"], placed["bme"]["rotation"]) == (100, 90)
    assert [(w["a"], w["b"], w["color"]) for w in res["wires"]] == [("bme.VIN", "extra.VIN", "red")]


def test_old_revisions_restore_without_deleted_parts(api, setup, clock):
    api, base, bme = setup
    led = api.post(
        "/api/parts", json={"name": "LED", "kind": "actuator", "pins": [pin("A")]}
    ).json()
    design = api.post(f"{base}/placements", json={"parts": [{"part_id": led["id"]}]}).json()
    clock.later()
    led_placement = next(p for p in design["placements"] if p["ref"] == "led")
    api.delete(f"{base}/placements/{led_placement['id']}")
    assert api.delete(f"/api/parts/{led['id']}").status_code == 204
    [revision] = history(api, base)
    assert revision["part_count"] == 3
    res = api.post(f"{base}/revisions/{revision['id']}/restore").json()
    assert sorted(p["ref"] for p in res["placements"]) == ["bme", "bme2"]


def test_a_renamed_pin_is_found_by_id(setup, clock):
    api, base, bme = setup
    api.post(f"{base}/wires", json={"wires": [{"a": "bme.GND", "b": "bme2.GND"}]})
    clock.later()
    wire = api.get(base).json()["wires"][0]
    api.delete(f"{base}/wires/{wire['id']}")
    pins = api.get(f"/api/parts/{bme['id']}").json()["pins"]
    renamed = [{**p, "name": "G"} if p["name"] == "GND" else p for p in pins]
    api.put(f"/api/parts/{bme['id']}/pins", json={"pins": renamed})
    [revision] = history(api, base)
    res = api.post(f"{base}/revisions/{revision['id']}/restore").json()
    assert [(w["a"], w["b"]) for w in res["wires"]] == [("bme.G", "bme2.G")]


def test_only_the_latest_50_are_kept(setup, clock):
    api, base, _ = setup
    clock.later()
    api.post(f"{base}/wires", json={"wires": [{"a": "bme.GND", "b": "bme2.GND"}]})
    first = history(api, base)[0]["id"]
    for _ in range(55):
        api.post(f"{base}/revisions/{history(api, base)[0]['id']}/restore")
    kept = history(api, base)
    assert len(kept) == 50
    assert first not in [r["id"] for r in kept]
    assert api.post(f"{base}/revisions/{first}/restore").status_code == 404


def test_revisions_go_with_the_design(setup):
    api, base, _ = setup
    assert api.delete(base).status_code == 204
    assert api.get(f"{base}/revisions").status_code == 404
