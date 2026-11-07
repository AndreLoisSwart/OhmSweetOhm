# CLAUDE.md — Ohm Sweet Ohm

Ohm Sweet Ohm is a personal electronics workbench: a library of off-the-shelf modules (ESP32, Arduino, sensor breakouts) and wiring designs built on a canvas, which Claude can read, review and build over MCP. Single user, self-hosted as a Home Assistant add-on next to its sibling **Shelf-help** (`~/Github/ShelfHelp`), reached locally or over VPN.

## Read before working

| File | What it covers |
|---|---|
| `docs/project-overview.md` | Purpose, principles, stack, hosting, ports, Shelf-help integration |
| `docs/data-model.md` | Tables, enums and rules |
| `docs/checks.md` | Design rules: what each check fires on |
| `docs/mcp.md` | MCP tools and what Claude may and may not do |
| `docs/pages.md` | Pages, the design canvas, components, visual style |
| `docs/mvp.md` | Phase 1 scope, build order, decisions |
| `docs/future-enhancements.md` | Phase 2 (Wokwi simulation, firmware) and ideas |

## Ground rules

- **Stay inside `docs/mvp.md`.** Don't build phase 2 or ideas unless asked. If a change alters a decision, update the relevant doc in the same change.
- **Shelf-help is the template.** Copy its skeleton, access layer, Ingress handling, add-on files and MCP setup rather than reinventing them, and keep its conventions.
- **Organise by feature:** `backend/app/modules/<feature>/` (models, schemas, router, service) and `frontend/src/features/<feature>/`.
- **The connection list is the truth.** The canvas only reads and writes placements and wires through the API; nothing about a design lives only in the frontend.
- **Nets and check results are computed.** Never store them.
- **Every change to a design through MCP saves a revision first.** No deletes through MCP; free text is append-only for Claude.
- **Every schema change gets an Alembic migration.** Regenerate the TypeScript API client after any API change; never hand-write API types.
- **Business rules live in the service layer.** Routers stay thin.
- **Ingress:** relative asset paths (Vite `base: './'`), router base path read at runtime, no absolute URLs.
- **All persistent data goes in `/data`.**
- **Ports differ from Shelf-help:** backend 8097, Vite 5174, Ingress stand-in 8096.
- **Keep wire/pin data Wokwi-compatible** so phase 2 export is lossless.

## Commands

Python is managed with `uv`, the frontend with `npm`. Local image builds use Podman (rootless); HAOS builds with its own Docker.

| Task | Command |
|---|---|
| Install backend deps | `cd backend && uv sync` |
| Install frontend deps | `cd frontend && npm install` |
| Backend dev server (port 8097, hot reload) | `cd backend && uv run uvicorn app.main:create_app --factory --reload --port 8097` |
| Frontend dev server (port 5174, proxies `/api` and `/mcp` to 8097) | `cd frontend && npm run dev` |
| Backend tests | `cd backend && uv run pytest` |
| Frontend tests | `cd frontend && npm test` |
| Lint and format check (backend) | `cd backend && uv run ruff check . && uv run ruff format --check .` |
| Lint and format check (frontend) | `cd frontend && npm run lint` (fix formatting with `npm run format`) |
| Apply migrations to the dev database (`.data/`) | `cd backend && uv run alembic upgrade head` |
| Create a migration after changing models | `cd backend && uv run alembic revision --autogenerate -m "<what changed>"`, then review the generated file |
| Regenerate the API client after any API change | `cd frontend && npm run gen:api` |
| Build frontend (served by the backend from `frontend/dist`) | `cd frontend && npm run build` |
| Test behind a fake Ingress prefix (needs a built frontend and the backend on 8097) | `cd backend && uv run python scripts/ingress_proxy.py`, then open `http://127.0.0.1:8096/api/hassio_ingress/dev-token/` |
| Build the add-on image | `podman build -t ohm-sweet-ohm .` |
| Run the add-on image (open via `127.0.0.1`, not `localhost`: rootless Podman resets IPv6 connections). Without the `-e`, the port behaves as on HAOS: only `/mcp`, with the token | `podman run --rm -p 8097:8097 -v ./.data:/data -e OHM_TRUSTED_CLIENTS='["0.0.0.0/0"]' ohm-sweet-ohm` |

Notes:
- Data lives in `OHM_DATA_DIR`: `.data/` at the repo root in dev, `/data` in the add-on. Upload limit: `OHM_MAX_UPLOAD_MB` (default 50).
- The add-on runs `alembic upgrade head` on every start (`addon/run.sh`).
- `tests/test_db.py` fails if models change without a matching migration.
- `npm run gen:api` exports the spec to `frontend/openapi.json` and regenerates `frontend/src/api/generated/`. Both are committed; never edit them by hand.
- Add shadcn components with `cd frontend && npx shadcn@latest add <name>`.
- The backend reads `frontend/dist/index.html` once at startup: restart it after rebuilding the frontend, or the page asks for old asset files and loads blank.
- Access (`app/core/access.py`): requests from `OHM_TRUSTED_CLIENTS` (HA's Ingress gateway in the add-on; also loopback in dev) reach everything. Anything else reaches only `/mcp`, with the token from `.data/mcp-token`. Tests act as trusted unless they set another client address.
- `/mcp` is a stub with no tools until build step 7.
- The Ingress stand-in answers 502 when the backend is down, as HA does, so the connection banner can be tested by stopping the backend.

**Deploying:** the repo root is the add-on folder (`config.yaml` and `Dockerfile` live there). Clone it into `/addons` on HAOS, then install it from Settings → Add-ons → Add-on store → Local add-ons. To update, pull, bump `version` in `config.yaml`, and rebuild from the add-on page.
