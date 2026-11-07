import os
import stat

import pytest
from fastapi.testclient import TestClient

from app.core.access import AccessMiddleware
from app.core.config import settings
from app.modules.mcp import token

LAN = ("192.168.1.50", 50000)  # e.g. Claude Code on a desktop, via the direct port
INGRESS = ("172.30.32.2", 50000)
HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def rpc(method: str, params: dict | None = None) -> dict:
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}


def auth(value: str) -> dict:
    return {**HEADERS, "authorization": value}


@pytest.fixture
def lan(api):
    """A client on the LAN, outside Ingress, with the MCP server running."""
    with TestClient(api.app, client=LAN) as client:
        yield client


@pytest.mark.parametrize("path", ["/", "/parts", "/api/health", "/api/docs"])
def test_lan_only_reaches_mcp(lan, path):
    res = lan.get(path)
    assert res.status_code == 403
    assert "Only /mcp" in res.json()["detail"]


def test_mcp_needs_the_token(lan):
    res = lan.post("/mcp", headers=HEADERS, json=rpc("tools/list"))
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"
    for value in ("Bearer wrong", f"Basic {token.get_token()}", "Bearer ", token.get_token()):
        res = lan.post("/mcp", headers=auth(value), json=rpc("tools/list"))
        assert res.status_code == 401, value


def test_mcp_with_the_token(lan):
    res = lan.post("/mcp", headers=auth(f"Bearer {token.get_token()}"), json=rpc("tools/list"))
    assert res.status_code == 200, res.text
    assert res.json()["result"]["tools"] == []  # tools arrive in build step 7


def test_a_token_does_not_open_the_rest(lan):
    headers = {"authorization": f"Bearer {token.get_token()}"}
    assert lan.get("/api/health", headers=headers).status_code == 403


def test_forwarded_headers_are_not_trusted(lan):
    spoof = {"x-forwarded-for": "172.30.32.2", "x-real-ip": "127.0.0.1"}
    assert lan.get("/api/health", headers=spoof).status_code == 403


def test_ingress_reaches_everything(api):
    client = TestClient(api.app, client=INGRESS)
    assert client.get("/api/health").status_code == 200


def test_trusted_networks():
    middleware = AccessMiddleware(None, ["172.30.32.2", "10.0.0.0/8", "::1"], lambda t: False)
    assert middleware.is_trusted("172.30.32.2")
    assert middleware.is_trusted("10.1.2.3")
    assert middleware.is_trusted("::1")
    assert not middleware.is_trusted("172.30.32.1")
    assert not middleware.is_trusted("192.168.1.50")
    assert not middleware.is_trusted("testclient")


def test_token_is_kept_and_private():
    first = token.get_token()
    assert len(first) >= 40
    assert token.get_token() == first
    mode = stat.S_IMODE(os.stat(settings.data_dir / token.TOKEN_FILE).st_mode)
    assert mode == 0o600


def test_regenerating_retires_the_old_token(lan):
    old = token.get_token()
    new = token.regenerate()
    assert new != old
    url, body = "/mcp", rpc("tools/list")
    assert lan.post(url, headers=auth(f"Bearer {old}"), json=body).status_code == 401
    assert lan.post(url, headers=auth(f"Bearer {new}"), json=body).status_code == 200
