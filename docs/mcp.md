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
| `search_parts(query?, kind?, tag?)` | Parts with name, kind, logic voltage, verified flag and Shelf-help item id |
| `get_part(part_id)` | The full part, with every pin (kind, functions, voltage, flags) in header order |
| `create_part(...)` | A new part with its pins. Starts unverified |
| `update_part(part_id, ...)` | Change fields; add, rename or reorder pins. A wired pin can't be removed. Sets the part unverified if pins change |
| `append_part_notes(part_id, text)` | Add to the part's notes |
| `list_tags()`, `create_tag(name)` | Tags for parts and designs |

**Designs**

| Tool | What it does |
|---|---|
| `list_designs(query?)` | Designs with part count, Shelf-help project id and last change |
| `get_design(design_id)` | Placements (ref, part, position), wires (`esp.GPIO21 → bme.SDA`, colour) and computed nets. Readable as a netlist |
| `create_design(name, description?, shelf_project_id?)` | A new, empty design |
| `update_design(design_id, name?, shelf_project_id?)` | Rename or link to Shelf-help |
| `append_design_description(design_id, text)` | Add to the description |
| `add_parts(design_id, parts: [{part_id, ref, x?, y?}])` | Place one or more parts |
| `update_placement(design_id, ref, new_ref?, x?, y?, rotation?, note?)` | Move, rename or annotate |
| `remove_placement(design_id, ref)` | Remove a part and its wires (revision saved first) |
| `connect(design_id, wires: [{a: "esp.GPIO21", b: "bme.SDA", color?, label?}])` | Add one or more wires |
| `disconnect(design_id, a, b)` | Remove a wire |
| `check_design(design_id)` | Run every check (see `checks.md`) |
| `list_revisions(design_id)`, `restore_revision(design_id, revision_id)` | History, and undo |

Tools that change a design take batches (`add_parts`, `connect`), so that building a circuit is a few calls rather than dozens. Each call is one revision.

## Server instructions (draft)

> **Ohm Sweet Ohm** is the user's electronics workbench: a library of modules (parts with pins) and designs (wiring diagrams of placed parts and pin-to-pin wires). Shelf-help, a separate server, holds stock (have/low/out/need) and projects; parts and designs carry Shelf-help ids.
>
> - Refer to pins as `ref.PIN`, e.g. `esp.GPIO21`.
> - Use the exact pin names from `get_part`.
> - Run `check_design` after changing a design, and fix errors or explain them.
> - **Parts you create are unverified.** Take pinouts from the datasheet or the maker's page, say where they came from in the part's notes, and ask the user to check them.
> - **Search before creating a part.** When adding a part, also find or create its Shelf-help item and store the id.
> - **"Do I have what this design needs?":** look up each part's Shelf-help item. Offer to mark missing ones as `need`.
> - **Nothing can be deleted.** Removing parts and wires within a design is fine, since every change is undoable.
