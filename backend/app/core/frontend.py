"""Serves the built frontend, including behind Home Assistant Ingress.

Ingress proxies the app under a prefix such as /api/hassio_ingress/<token> that
can change, strips it from the request path and passes it in X-Ingress-Path.
The prefix is injected into index.html as a <base> tag (so relative asset URLs
resolve from the app root on any route) and as window.__BASE_PATH__ (for the
router basename and API calls).
"""

import json
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

INGRESS_HEADER = "X-Ingress-Path"
_SAFE_PATH = re.compile(r"(/[A-Za-z0-9_.~-]+)*")


def base_path(request: Request) -> str:
    """The prefix the app is served under, or "" when reached directly."""
    path = request.headers.get(INGRESS_HEADER, "").rstrip("/")
    return path if _SAFE_PATH.fullmatch(path) else ""


def render_index(template: str, base: str) -> str:
    tags = f'<base href="{base}/"><script>window.__BASE_PATH__ = {json.dumps(base)};</script>'
    return template.replace("<head>", "<head>" + tags, 1)


def mount_frontend(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        return
    template = index.read_text()
    dist = dist.resolve()
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str, request: Request):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)
        file = (dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(dist):
            return FileResponse(file)
        # Any other path is a client-side route.
        return HTMLResponse(
            render_index(template, base_path(request)),
            headers={"Cache-Control": "no-cache"},
        )
