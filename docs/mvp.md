# MVP (phase 1)

Details live in `data-model.md`, `checks.md`, `mcp.md` and `pages.md`. This file defines scope and build order.

## In scope

**Part library**
- [ ] Parts CRUD with kind, voltages, I2C addresses, datasheet link, notes, tags, attachments
- [ ] Pin editor with header order and sides, and a live card preview
- [ ] Verified / unverified, with a filter
- [ ] Shelf-help item id on a part
- [ ] Starter set of common modules (see below)

**Designs**
- [ ] Designs CRUD, with tags and an optional Shelf-help project id
- [ ] Canvas: drag parts from the library, wire pin to pin, move, rotate, remove, wire colours
- [ ] Net highlighting on hover
- [ ] Undo/redo while editing; revisions with restore
- [ ] Read-only view on phones

**Checks**
- [ ] Every rule in `checks.md`, run on the server, shown in the checks bar and on the design list

**Claude (MCP)**
- [ ] Token-protected `/mcp` on the direct port, as in Shelf-help
- [ ] Every tool in `mcp.md`
- [ ] Settings page with the token and the Claude Code / Claude Desktop setup

**Platform**
- [x] HA add-on packaging, Ingress-compatible, data in `/data`, cold backups
- [x] Ports separate from Shelf-help, so both run side by side

## Starter parts

These are entered and verified by hand (or by Claude, then checked), from the maker's pinouts:
- **Boards:** ESP32 DevKit V1 (30-pin), ESP32-C3 SuperMini, Arduino Uno R3, Arduino Nano, Wemos D1 Mini
- **Sensors:** BME280, DHT22, DS18B20, HC-SR04, PIR (HC-SR501), BH1750, INA219
- **Displays:** SSD1306 128×64 I2C
- **Actuators:** relay module (1-channel), SG90 servo, LED, push button, WS2812B strip
- **Power:** USB 5 V supply, AMS1117 3.3 V regulator, 18650 holder

Before copying pin data from an outside library (Fritzing parts are CC-BY-SA; check Wokwi's element definitions' licence), confirm the licence allows it. Typing pinouts from datasheets is always fine.

## Build order

Packaging and the canvas are the riskiest parts, so they come first.

1. **Skeleton and deployment.** Copy Shelf-help's skeleton (backend factory, Ingress base path, access layer, frontend serving, add-on files), rename, change the ports and confirm it runs on HAOS next to Shelf-help.
2. **Canvas spike.** A throwaway React Flow page with two hard-coded parts and wiring between pins, to settle node and handle layout, pin density (a 30-pin ESP32 must stay readable) and touch behaviour, before the data model is built around it.
3. **Parts and pins.** Models, API, parts list, part page with the pin editor and preview.
4. **Designs.** Placements, wires, the real canvas, saving, nets.
5. **Checks.** The rules engine and the checks bar.
6. **Revisions.** History, restore, canvas undo.
7. **MCP.** Token, tools, Settings page. Test end to end with Claude building a small design from scratch.
8. **Starter parts.** Enter and verify the set above.
9. **Polish.** Phone read-only view, empty states, errors, icon.

## Out of scope for phase 1

- Simulation, Wokwi export and firmware generation (see `future-enhancements.md`)
- Breadboard view, PCB layout, schematic symbols
- Passive components as values (resistor ohms, capacitor farads) beyond simple parts
- Stock tracking (that's Shelf-help)
- Calls between this app and Shelf-help

## Decisions

Decided (2026-11-07):
- **Separate app, separate add-on.** Ohm Sweet Ohm is its own add-on rather than part of Shelf-help; the two are linked by stored ids, with Claude doing the cross-referencing.
- **Off-the-shelf modules only.** Boards and breakouts, not custom PCBs.
- **The canvas is a wiring diagram** of module cards, not a realistic breadboard.
- **The connection list is the data.** The canvas is one view of it.
- **Claude's permissions:** no deletes through MCP, but Claude may add, change and remove anything inside a design. Every change saves a revision first.
- **Simulation is phase 2,** through Wokwi's `diagram.json` format rather than a simulator of our own.
- **Name:** Ohm Sweet Ohm, by coin toss over Current Affairs.

Decided after the canvas spike (2026-11-07, details in `pages.md`, Canvas spike findings):
- **React Flow (`@xyflow/react` 12)** for the canvas, with custom part cards and wires.
- **Cards are laid out from pin data,** on a 10 px grid with a 20 px pin pitch. `Part.width/height` is dropped; the size is computed.
- **Rotation is logical:** pins move to other sides and labels stay upright, rather than turning the card with CSS. Stored as degrees.
- **Phones get the read-only canvas** by media query, with tap to highlight a net; tablets wire by tap-pin-tap-pin or dragging.
