import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import create_app

INDEX = "<!doctype html><html><head><title>t</title></head><body></body></html>"
PREFIX = "/api/hassio_ingress/abc123"
# As if through Ingress (see core/access.py).
TRUSTED = ("127.0.0.1", 50000)


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path / "index.html").write_text(INDEX)
    monkeypatch.setattr(config.settings, "frontend_dist", tmp_path)
    return TestClient(create_app(), client=TRUSTED)


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_unknown_api_path_is_404_not_index(client):
    assert client.get("/api/nope").status_code == 404


def test_assets_and_public_files(client):
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/favicon.svg").text == "<svg/>"


def test_path_traversal_is_not_served(client, tmp_path):
    (tmp_path.parent / "secret.txt").write_text("secret")
    res = client.get("/..%2Fsecret.txt")
    assert "secret" not in res.text


@pytest.mark.parametrize("route", ["/", "/parts", "/designs/5"])
def test_routes_fall_back_to_index_with_ingress_base(client, route):
    res = client.get(route, headers={"X-Ingress-Path": PREFIX})
    assert f'<base href="{PREFIX}/">' in res.text
    assert f'window.__BASE_PATH__ = "{PREFIX}"' in res.text
    assert res.headers["cache-control"] == "no-cache"


def test_direct_access_uses_root_base(client):
    res = client.get("/parts")
    assert '<base href="/">' in res.text
    assert 'window.__BASE_PATH__ = ""' in res.text


def test_unsafe_ingress_header_is_ignored(client):
    res = client.get("/", headers={"X-Ingress-Path": '/x"><script>alert(1)</script>'})
    assert "alert" not in res.text
    assert '<base href="/">' in res.text


def test_api_only_without_built_frontend(tmp_path, monkeypatch):
    monkeypatch.setattr(config.settings, "frontend_dist", tmp_path / "missing")
    client = TestClient(create_app(), client=TRUSTED)
    assert client.get("/api/health").status_code == 200
    assert client.get("/").status_code == 404
