# Data model

## Tables

```
Part         id, name (unique, ignoring case), kind, description,
             logic_voltage, supply_min_v, supply_max_v,
             i2c_addresses (JSON list of ints, first is the default),
             datasheet_url, notes_md,
             verified, created_by,
             shelf_item_id (nullable, Shelf-help Item id),
             wokwi_type (nullable, e.g. "board-esp32-devkit-c-v4"),
             platform (nullable: espressif32, espressif8266, atmelavr),
             platformio_board (nullable, e.g. "esp32dev"),
             libraries (JSON list of {spec, platforms}),
             body_mm (nullable JSON {x, y, w, h}: the outline on a board, step 14),
             created_at, updated_at

Pin          id, part_id → Part, name (unique within the part),
             kind, functions (JSON list), voltage (nullable),
             flags (JSON list), side, position, wokwi_name (nullable),
             tie (nullable), code_name (nullable, from step 10),
             x_mm, y_mm (nullable, both or neither: the pin's hole, step 14)

Design       id, name, description_md,
             shelf_project_id (nullable, Shelf-help Project id),
             firmware_repo (nullable: a local path or repository URL),
             created_at, updated_at

Placement    id, design_id → Design, part_id → Part,
             ref (unique within the design), x, y, rotation, note

Wire         id, design_id → Design,
             a_placement_id, a_pin_id, b_placement_id, b_pin_id,
             color, label

Revision     id, design_id → Design, created_at, author, summary,
             snapshot (JSON: placements and wires)

Tag          id, name (unique, ignoring case)
PartTag      part_id, tag_id
DesignTag    design_id, tag_id

Attachment   id, original_filename, mime_type, size, stored_path, created_at,
             part_id | design_id   (exactly one set)
```

## Enums

| Enum | Values |
|---|---|
| `Part.kind` | `board`, `sensor`, `display`, `actuator`, `module`, `power`, `passive`, `other` |
| `Part.logic_voltage` | `3v3`, `5v`, `both` (works at either), `none` (e.g. a buzzer, a battery) |
| `Part.created_by` / `Revision.author` | `user`, `claude` |
| `Pin.kind` | `power_out`, `power_in`, `ground`, `gpio`, `analog`, `i2c_sda`, `i2c_scl`, `spi_mosi`, `spi_miso`, `spi_sck`, `spi_cs`, `uart_tx`, `uart_rx`, `enable`, `reset`, `nc`, `other` |
| `Pin.flags` | `input_only`, `strapping`, `flash` (wired to on-board flash, don't use), `adc2` (no analog while WiFi is on), `five_v_tolerant`, `open_drain`, `boot_high`, `boot_low` |
| `Pin.side` | `left`, `right`, `top`, `bottom` |
| `Wire.color` | `red`, `black`, `orange`, `yellow`, `green`, `blue`, `purple`, `gray`, `white`, `brown` |

## Rules

**Parts and pins**
- **Pin `kind` is the pin's main role; `functions` lists the alternates.** For example, ESP32 GPIO21 is `gpio` with functions `["i2c_sda"]`. The checks use both.
- **Pin `voltage`** means what a power pin supplies (`power_out`) or needs (`power_in`). For a signal pin it is the highest voltage the pin accepts. When empty, a signal pin takes the part's `logic_voltage`.
- **Pin order:** `side` and `position` place the pin on the canvas card, in the order of the real header. The card then reads like the physical board. The card's size is computed from its pins, never stored (see `pages.md`, Canvas spike findings).
- **Pin names** are unique within a part. Repeated silkscreen names are numbered (`GND`, `GND2`); board pins are named by the chip's GPIO (`GPIO21`), with Wokwi's name in `wokwi_name` where it differs.
- **Part `kind` `actuator`** means the board drives it: LEDs, relays, buzzers, servos. Buttons and switches are inputs (`other` or `sensor`), never actuators: the bring-up sketch drives actuator and display pins.
- **Pin `code_name`** (from step 10) is what firmware calls a board pin. When empty it comes from the name: `GPIO<n>` → `<n>`, `D<n>` → `<n>`, `A<n>` stays `A<n>`; any other name has no code name and can't appear in a pin map. Set it only where the rule is wrong for a board.
- **Part `platform` and `platformio_board`** (step 12) are for boards: PlatformIO's platform and board id, which a design's `platformio.ini` uses.
- **Part `libraries`** (step 12) are what firmware for the part needs: each a PlatformIO spec (`owner/Name@^major.minor`, one line, no commas) and the platforms it's for, empty meaning all (the SG90 lists `Servo` for `atmelavr` and `ESP32Servo` for `espressif32`). Repeats, ignoring case, are dropped. The list is saved whole.
- **Firmware fields and verification:** Claude changing a part's platform, PlatformIO board or libraries sets it unverified, as changing its pins does. Other field changes don't.
- **Unverified parts:**
  - A part Claude creates starts with `verified = false`; a part the user creates starts verified.
  - The user marks a part verified from its page, and any later change Claude makes to its pins sets it back to unverified.
  - Unverified parts show a badge everywhere and add a warning to every design check they appear in.
- **Pins are saved as a whole list** (`PUT /api/parts/{id}/pins`), each side in header order; positions come from the order. Pins sent with their id are updated in place, so wires to them survive a rename; pins left out are removed, the rest added.
- **Deleting a pin** is blocked while it is wired in any design (checked from build step 4). Renaming one is fine.
- **Deleting a part** is blocked while it is placed in any design (from build step 4). Its pins, tag links and attachments go with it.
- **Copying a part** makes a new, verified part named "… (copy)" with the same fields, pins and tags, but no attachments and no Shelf-help item id.
- **Shelf-help ids** (`shelf_item_id`, `shelf_project_id`) are plain integers with no foreign key, since they point into another database. The app never checks them; Claude does, through both MCP servers.

**Designs**
- **Placement position and rotation:** `x`, `y` are the card's top-left corner in canvas px, on the 10 px grid. `rotation` is 0, 90, 180 or 270 degrees clockwise (as Wokwi's `rotate`); rotating moves pins to other sides and keeps labels upright.
- **Placement `ref`** is short, unique within the design and safe as an identifier (`[a-z][a-z0-9_]*`, up to 20 characters), e.g. `esp`, `bme`, `led1`. Wires and MCP tools refer to pins as `ref.PIN` (e.g. `esp.GPIO21`).
- **Wires:**
  - A wire joins two pins of placements in the same design.
  - A wire from a pin to itself is refused, and so is a second wire between the same two pins (in either direction).
  - A pin can have many wires.
- **Wire colour:** when none is given, it defaults by pin kind: red for power, black for ground, otherwise the next colour in a fixed rotation (blue, green, yellow, orange, purple, white, brown), counting only the design's signal wires.
- **Pins joined inside a part:** all of a part's ground pins are one node, and so are its pins with the same `tie` (two 3V3 pins both tied `3V3`). Nets include them once any of them is wired, so a board's GND and GND2 are one net, and a short to either is caught.
- **Nets** are computed from wires and those joins (union-find) whenever they are read, and never stored. A net is named after its power or ground pin when it has one (`3V3`, `GND`; a `power_out` pin first, then ground, then `power_in`), otherwise after its lowest `ref.PIN`. Two separate nets that would share a name are numbered (`GND`, `GND_2`).
- **Removing a placement** removes its wires. This is allowed for Claude too (see Revisions).
- **Positions when Claude adds a part:** a placement added without a position goes to the right of the existing parts, on the grid. Positions are snapped to the grid on save.
- **Automatic refs:** a placement added without a ref gets the first letters of its part's name (`bme` from "BME280 breakout", `esp` from "ESP32 DevKit"), then `bme2`, `bme3`. Refs are stored in lower case.
- **Wire ends in the API** are `ref.PIN`; pin names match ignoring case.

**Revisions**
- **Changes from Claude:** before each MCP tool call that changes a design, the server saves a revision (`author = claude`) with a one-line summary, e.g. "Removed led1 and its 2 wires".
- **Changes on the canvas:** saved as you go. A revision is taken at most once per editing session (the first change to placements or wires after 10 minutes of quiet, judged by the design's `updated_at` and its latest revision), so history stays readable. A new design's first edits are one session with no revision before them. The canvas also has its own in-memory undo while you edit.
- **What a revision holds:** the snapshot of placements (ref, part, position, rotation, note) and wires (ends as `ref.PIN` plus pin ids, colour, label), as the design was before the change in its summary. Not the name, description, tags or links.
- **Restoring, and the canvas's undo,** set placements and wires to a snapshot (`PUT /api/designs/{id}/layout`). Placements are matched by ref, so unchanged ones keep their ids. Pins are found by id, then by name, so a renamed pin still matches. Anything that no longer exists (a deleted part, a removed pin) is left out, so an old revision always restores.
- **Restoring a revision** first saves the current state as a revision, so a restore can be undone too.
- **Retention:** keep the latest 50 revisions per design.

**Deletes**
- **Through MCP:** nothing can be deleted: no parts, pins, designs, tags or revisions.
- **Within a design, Claude can:** add, move and remove placements, add and remove wires, and edit labels and colours. Revisions make all of it undoable.
- **Free text:** Claude can only append to `notes_md` and `description_md`, never rewrite them.
- **In the app:** the user can delete anything, with a confirmation.

## Footprints (step 14)

- **Millimetres throughout.** A pin's hole (`x_mm`, `y_mm`) and the part's outline (`body_mm`) are measured from the part's origin, usually its first pin, in the top view with x to the right and y down, to 0.01 mm.
- **Protoboard holes are 2.54 mm apart.** A part sits on a protoboard as it is only when its holes are multiples of 2.54 mm from its first hole; the footprint editor marks any that aren't.
- **A hole is part of the pin:** renaming or reordering pins keeps their holes. Changing a footprint through MCP sets the part unverified, as changing its pins does.

## Protoboard layouts (step 15)

```
Layout         id, design_id → Design, name, board_type (stripboard | breadboard),
               strips, holes, pitch_mm (hole spacing, 2.54 unless set),
               notes, created_at, updated_at
LayoutPart     id, layout_id → Layout, placement_id → Placement (unique per layout),
               on_board, strip, hole (the footprint's origin; null off board),
               rotation, mount (socketed | soldered), footprint_sig
Cut            id, layout_id, strip, hole, between
Jumper         id, layout_id, a_strip, a_hole, b_strip, b_hole, side (top | bottom),
               insulated, color
Connector      id, layout_id, ref (unique per layout), type (header_male |
               header_female | jst_xh | screw_508), pin_count, strip, hole, rotation
ConnectorPin   id, connector_id, index (from 1), placement_id, pin_id (the off-board
               pin it carries; set to null when that placement or pin goes)
LayoutRevision id, layout_id, created_at, author, summary, snapshot (JSON)
```

- **A layout holds only physical facts.** Nets come from its design; board connectivity and layout checks are computed, never stored.
- **Positions are 1-based** and read as the board's labels: strip 3, hole 14 is C14.
- **A layout's `pitch_mm` sets its grid:** footprints (in mm) land on holes that far apart, within 0.1 mm. A breadboard pattern is always 2.54.
- **A placement with no `LayoutPart` isn't placed yet.** Removing a placement from the design removes it from its layouts, and deleting a design deletes its layouts.

