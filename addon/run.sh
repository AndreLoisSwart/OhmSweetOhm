#!/bin/sh
set -e
cd /app/backend
.venv/bin/alembic upgrade head
# Only HA's Ingress gateway is trusted; everything else needs the MCP token and may
# only reach /mcp (app/core/access.py). No proxy headers: trust the real address only.
# (Overridable only for local image tests; HA gives add-ons no way to set it.)
export OHM_TRUSTED_CLIENTS="${OHM_TRUSTED_CLIENTS:-[\"172.30.32.2\"]}"
exec .venv/bin/uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8097 \
  --no-proxy-headers
