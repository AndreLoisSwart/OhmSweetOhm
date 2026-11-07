# Ohm Sweet Ohm — project overview

## Purpose

Ohm Sweet Ohm is a workbench for hobby electronics built from off-the-shelf modules: ESP32 and Arduino boards, sensor breakouts, displays, relays and the like.

It does two jobs:

1. **A part library.** What each module *is*: its pins, what they do, its voltages and quirks. You define a part once and use it in any design.
2. **Designs.** Wiring diagrams you build by dragging parts onto a canvas and drawing wires between pins. Claude can read, review and build the same designs over MCP.

It is the sibling of **Shelf-help**, which stays the place for physical stock and for projects. Ohm Sweet Ohm stores the ids of Shelf-help records, so that Claude can tie the two together.

## Principles

1. **The connection list is the truth; the canvas is a view.** A design is a set of placed parts and pin-to-pin wires. What you draw and what Claude reads are the same data, so they can't drift apart.
2. **Checks are rules, not opinions.** Mistakes such as 5 V into a 3.3 V pin or two I2C devices at the same address are found by code on the server. Claude gets them as facts and reviews the rest on top.
3. **Stock lives in Shelf-help.** This app never tracks whether you have a part. A part can point to a Shelf-help item, and that item says have, low, out or need.
4. **Parts Claude creates are unverified until you check them.** A pinout read from a datasheet can be wrong, and a wrong pinout can kill a board. Unverified parts are marked in the UI and in check results.
5. **Ready for simulation.** Designs are stored so that they convert cleanly to Wokwi's `diagram.json` (phase 2). Nothing here should make that conversion lossy.
6. **Clean UI.** It uses the same neutral theme and single accent colour as Shelf-help. Wire colours and status colours are the only other colour.

## Core concepts

- **Part:** a kind of module in the library, e.g. "ESP32 DevKit V1 (30-pin)" or "BME280 breakout". It has pins, voltages, an optional I2C address, a datasheet link and notes.
- **Pin:** a named connection point on a part, with a kind (power, ground, GPIO, I2C SDA…), alternate functions and flags such as input-only or strapping pin.
- **Design:** one circuit. It can link to a Shelf-help project.
- **Placement:** one part placed in a design, with a short reference name (`esp`, `bme`, `led1`) and a canvas position.
- **Wire:** a connection between two pins in a design, with a colour.
- **Net:** a set of pins joined by wires. Nets are computed, never stored.
- **Check:** a rule run against a design, giving errors, warnings and notes.
- **Revision:** a saved copy of a design taken before a change, so that any change (yours or Claude's) can be undone.

## Tech stack

The stack is the same as Shelf-help's, so that patterns and code carry over.

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Database | SQLite (single file in `/data`) |
| Frontend | React, TypeScript, Vite |
| UI | shadcn/ui (Radix + Tailwind) |
| Data fetching | TanStack Query with an orval-generated client |
| Canvas | React Flow (`@xyflow/react`, MIT): parts are nodes, pins are handles, wires are edges |
| MCP | Official Python MCP SDK, streamable HTTP at `/mcp`, stateless JSON |
| Tests | pytest, Vitest |

## Hosting

The setup is the same as Shelf-help's and has been proven there.

- **Hosting:** a custom Home Assistant add-on, opened through **HA Ingress** as a sidebar panel.
- **Direct LAN port (8097), disabled by default.** It serves **only `/mcp`, and only with the MCP token**. The app itself is only reachable through Ingress. This copies Shelf-help's `app/core/access.py`.
- **Remote access:** through the existing VPN. Nothing is exposed to the internet.
- **Data:** lives in `/data` (database and attachments). The add-on uses cold backups.
- **Migrations:** run on every start.
- **Ports:** they differ from Shelf-help's so both can run side by side, in dev and on HAOS.

  | | Shelf-help | Ohm Sweet Ohm |
  |---|---|---|
  | Backend / add-on | 8099 | 8097 |
  | Vite dev server | 5173 | 5174 |
  | Ingress stand-in | 8100 | 8096 |

## Shelf-help integration

- **Parts:** a part may store `shelf_item_id`.
- **Designs:** a design may store `shelf_project_id`.
- **Phase 1: Claude makes the link.** The apps never call each other. Claude reads a design here, checks stock and projects through Shelf-help's MCP, and creates "need" items there for missing parts. This keeps both apps' locked-down access model intact.
- **Later, only if wanted:** Ohm Sweet Ohm shows have/low/out next to parts. That would need a separate read-only token on Shelf-help, never its full API. See `future-enhancements.md`.

## Repo structure (target)

```
/
├─ CLAUDE.md
├─ config.yaml              # HA add-on config
├─ Dockerfile
├─ docs/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ core/              # config, db, access, frontend serving
│  │  └─ modules/
│  │     ├─ parts/          # library: parts and pins
│  │     ├─ designs/        # designs, placements, wires, revisions
│  │     ├─ checks/         # design rules, computed, no tables
│  │     ├─ exports/        # Wokwi diagram.json (phase 2)
│  │     ├─ mcp/            # MCP server and token
│  │     └─ settings/
│  ├─ migrations/
│  ├─ scripts/
│  └─ tests/
├─ frontend/
│  └─ src/
│     ├─ api/               # generated client
│     ├─ components/
│     ├─ lib/
│     └─ features/          # parts, designs (canvas), checks, settings
└─ addon/
```

## Conventions

These are the same as Shelf-help's:
- Organise by feature.
- Routers stay thin; rules live in services.
- Every schema change gets a migration.
- Regenerate the API client after any API change.
- Use relative paths for Ingress.
- Timestamps are UTC.
