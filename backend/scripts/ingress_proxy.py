"""Dev-only stand-in for Home Assistant Ingress.

Serves the app under a fake prefix, stripping it before forwarding and passing
it in X-Ingress-Path, the way HA does. Run the backend on 8097 with a built
frontend, then open http://127.0.0.1:8096/api/hassio_ingress/dev-token/
"""

import argparse

import httpx2
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response
from starlette.routing import Route

PREFIX = "/api/hassio_ingress/dev-token"
# Hop-by-hop headers, plus encoding/length, which change because httpx2 decodes the body.
DROP_HEADERS = {"host", "connection", "content-length", "content-encoding", "transfer-encoding"}


def build_app(upstream: str) -> Starlette:
    client = httpx2.AsyncClient(base_url=upstream)

    async def proxy(request: Request) -> Response:
        path = request.url.path
        if not path.startswith(PREFIX + "/"):
            return RedirectResponse(PREFIX + "/")
        target = path[len(PREFIX) :]
        if request.url.query:
            target += "?" + request.url.query
        headers = {k: v for k, v in request.headers.items() if k not in DROP_HEADERS}
        headers["X-Ingress-Path"] = PREFIX
        try:
            res = await client.request(
                request.method, target, headers=headers, content=await request.body()
            )
        except httpx2.TransportError:
            # What HA answers while the add-on is down or restarting.
            return Response("Bad Gateway", 502)
        out = {k: v for k, v in res.headers.items() if k not in DROP_HEADERS}
        return Response(res.content, res.status_code, out)

    methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    return Starlette(routes=[Route("/{path:path}", proxy, methods=methods)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8096)
    parser.add_argument("--upstream", default="http://127.0.0.1:8097")
    args = parser.parse_args()
    uvicorn.run(build_app(args.upstream), port=args.port)
