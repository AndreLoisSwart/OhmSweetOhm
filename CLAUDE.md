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

To be filled in at build step 1, mirroring Shelf-help's `CLAUDE.md` with the ports above.
