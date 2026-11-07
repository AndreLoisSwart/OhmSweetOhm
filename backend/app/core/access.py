"""Who may reach what, by where the request comes from.

- Through HA Ingress: everything. Ingress requests come from the Supervisor's address
  (172.30.32.2), and HA has already logged the user in.
- Anywhere else (the optional direct port): only /mcp, and only with the MCP token.
  The app's pages and API are refused, so enabling the port never exposes them.

Trust is by the connection's own address, never by headers such as X-Forwarded-For,
which a client could fake (the add-on also runs uvicorn with --no-proxy-headers).
"""

import ipaddress
import json
from collections.abc import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

MCP_PATH = "/mcp"


def bearer_token(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            scheme, _, token = value.decode("latin-1").partition(" ")
            if scheme.lower() == "bearer" and token.strip():
                return token.strip()
    return None


class AccessMiddleware:
    def __init__(
        self, app: ASGIApp, trusted_clients: list[str], token_is_valid: Callable[[str], bool]
    ) -> None:
        self.app = app
        self.trusted = [ipaddress.ip_network(entry) for entry in trusted_clients]
        self.token_is_valid = token_is_valid

    def is_trusted(self, host: str) -> bool:
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            return False  # not an IP address at all
        return any(address in network for network in self.trusted)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)  # e.g. lifespan
        client = scope.get("client")
        if client and self.is_trusted(client[0]):
            return await self.app(scope, receive, send)

        if scope["path"] != MCP_PATH:
            return await _refuse(send, 403, "Only /mcp is available here. Use Ohm Sweet Ohm in HA.")
        token = bearer_token(scope)
        if token is None or not self.token_is_valid(token):
            return await _refuse(send, 401, "A valid MCP token is required.", bearer=True)
        await self.app(scope, receive, send)


async def _refuse(send: Send, status: int, detail: str, bearer: bool = False) -> None:
    body = json.dumps({"detail": detail}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    if bearer:
        headers.append((b"www-authenticate", b"Bearer"))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})
