# MCP server

Claude reaches Ohm Sweet Ohm over MCP at `/mcp`. The setup copies Shelf-help's phase 1, which is proven:
- **Access:** the direct port serves only `/mcp`, with a bearer token kept in `/data/mcp-token`. Settings shows the token and generates the Claude Code command and Claude Desktop config.
- **Implementation:** stateless JSON responses. Tools call the REST router functions, so rules and outputs are shared.
- **Errors:** refusals reach Claude with their reason. Anything unexpected is reported only as a failure.

Claude typically uses this server together with Shelf-help's. Linking the two apps happens in the conversation, not between the apps.

## Rules for Claude

These are the same as Shelf-help's:
- **No deletes.** No parts, pins, designs, tags or revisions are deleted through MCP.
- **Inside a design, Claude may change anything:** add, move or remove placements, and add or remove wires. Every change saves a revision first, so the user can undo it in the app.
- **Free text is append-only.** Part notes and design descriptions can only be added to.
- **Parts Claude creates start unverified.** So does any part whose pins Claude changes.
- **Search before creating,** to avoid duplicate parts.

## Tools (phase 1)

**Library**

| Tool | What it does |
|---|---|
| `search_parts(query?, kind?, tag_id?, unverified_only?)` → `{parts}` | Parts with name, kind, logic voltage, verified flag, pin count and Shelf-help item id |
| `get_part(part_id)` | The full part, with every pin (id, kind, functions, voltage, flags, side, position) in header order, and the designs it's placed in |
| `create_part(...)` | A new part with its pins. Starts unverified |
| `update_part(part_id, ..., pins?)` | Change fields. `pins` is the whole list, every existing pin sent with its id, plus new ones: that adds, renames and reorders pins. Leaving a pin out is refused (no deletes through MCP). Sets the part unverified if pins change; field changes don't. Notes aren't a field here (append only) |
| `append_part_notes(part_id, text)` | Add to the part's notes |
| `list_tags()`, `create_tag(name)` | Tags for parts and designs |

**Designs**

| Tool | What it does |
|---|---|
| `list_designs(query?)` | Designs with part count, Shelf-help project id and last change |
| `get_design(design_id)` | Placements (ref, part, position), wires (`esp.GPIO21 → bme.SDA`, colour) and computed nets. Readable as a netlist |
| `create_design(name, description_md?, shelf_project_id?, tag_ids?)` | A new, empty design |
| `update_design(design_id, name?, shelf_project_id?, tag_ids?)` | Rename, link to Shelf-help, or set tags |
| `append_design_description(design_id, text)` | Add to the description |
| `add_parts(design_id, parts: [{part_id, ref?, x?, y?, rotation?, note?}])` | Place one or more parts. Without a ref one is made from the part's name; without a position the part goes to the right of the others |
| `update_placement(design_id, ref, new_ref?, x?, y?, rotation?, note?)` | Move, rename or annotate |
| `remove_placement(design_id, ref)` | Remove a part and its wires (revision saved first) |
| `connect(design_id, wires: [{a: "esp.GPIO21", b: "bme.SDA", color?, label?}])` | Add one or more wires |
| `update_wire(design_id, a, b, color?, label?)` | Change a wire's colour or label |
| `disconnect(design_id, a, b)` | Remove a wire |
| `check_design(design_id)` | Run every check (see `checks.md`) |
| `list_revisions(design_id)`, `restore_revision(design_id, revision_id)` | History, and undo |
| `get_pin_map(design_id, lang?, board?)` | From step 10. The design's pins as firmware constants: `pins.h` (`lang` "c", the default) or `pins.py` ("py"), as `{lang, filename, board, boards, text}`. `board` is needed only with more than one board |

Tools that change a design take batches (`add_parts`, `connect`), so that building a circuit is a few calls rather than dozens. Each call that changes placements or wires saves one revision first (`author = claude`), summarising the change: "Added esp, BME280", "Connected esp.3V3 to bme.VIN, … and 1 more", "Moved and rotated esp", "Removed led1 and its 2 wires", "Disconnected esp.GND from bme.GND". Renaming a design, its tags and its description aren't in revisions (they aren't in a snapshot).

**After the first test with Claude Desktop (2026-11-07):**
- **Tool schemas are written out in full.** Some clients drop JSON Schema `$defs`, which left Claude guessing pin fields and allowed values; `inline_schema` puts every type in place, and `X | None` fields read as plain `X` (optional by not being required).
- **Lists come wrapped** (`{"parts": [...]}`, `{"designs": [...]}`, `{"tags": [...]}`, `{"revisions": [...]}`), so an empty list and a full one look alike.
- **Shelf-help ids:** `0` unlinks (`shelf_item_id`, `shelf_project_id`). The app still can't check ids; the instructions tell Claude to look each one up in Shelf-help first.

Every design answer is a `DesignView`: the design with its placed parts (ref, part, verified, position), wires as `ref.PIN`, computed nets and check counts. Refusals (a missing ref, a duplicate wire, a pin removal) come back as tool errors with the reason.

**Built in step 7 (2026-11-07):** all 21 tools above, in `backend/app/modules/mcp/server.py`, calling the same service functions as the REST API. Tested over `/mcp` with the token (`tests/test_mcp.py`), and end to end against a running app: parts created, placed and wired over MCP appeared on an open design page within seconds, with the "Claude changed this design" notice and Claude's revisions in History.

## Server instructions (draft)

> **Ohm Sweet Ohm** is the user's electronics workbench: a library of modules (parts with pins) and designs (wiring diagrams of placed parts and pin-to-pin wires). Shelf-help, a separate server, holds stock (have/low/out/need) and projects; parts and designs carry Shelf-help ids.
>
> - Refer to pins as `ref.PIN`, e.g. `esp.GPIO21`.
> - Use the exact pin names from `get_part`.
> - Run `check_design` after changing a design, and fix errors or explain them.
> - **Parts you create are unverified.** Take pinouts from the datasheet or the maker's page, say where they came from in the part's notes, and ask the user to check them.
> - **Search before creating a part.** When adding a part, also find or create its Shelf-help item and store the id.
> - **"Do I have what this design needs?":** look up each part's Shelf-help item. Offer to mark missing ones as `need`.
> - **Writing firmware (not ESPHome):** get the pin map, save it in the firmware as `pins.h` or `pins.py`, and use its constants rather than bare pin numbers. If a board pin has no code name, say so rather than guess.
> - **Nothing can be deleted.** Removing parts and wires within a design is fine, since every change is undoable.
