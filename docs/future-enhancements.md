# Future enhancements

## Phase 2 (decided in principle)

### Simulation through Wokwi

**Built (2026-11-08):** export only; running `wokwi-cli` from the app is still to come.
- **Files:** `GET /designs/{id}/wokwi`, the ⋯ menu's Simulate in Wokwi, and the MCP tool `get_wokwi_export`. `diagram.json`, plus `wokwi.toml` pointing at `.pio/build/<board ref>/firmware.bin` (or `.hex` on AVR), the env the generated `platformio.ini` names. With several boards, the toml needs one chosen.
- **Pin names:** a pin's `wokwi_name`, else on a board its code name (`GPIO4` → `4`, `D13` → `13`), else its own name.
- **Positions** are halved, since Wokwi's parts are about real size and far smaller than the cards. Rotation carries over.
- **ESP32 boards** get their UART pins wired to `$serialMonitor`, which Wokwi needs to show Serial.
- **Starter parts with a Wokwi type:**
  - ESP32 DevKit V1 (`wokwi-esp32-devkit-v1`: `D21`, `TX0`, `GND.1`…), ESP32-C3 SuperMini (`board-aitewinrobot-esp32c3-supermini`), Uno and Nano.
  - DHT22, DS18B20, HC-SR04, PIR, SSD1306 (`board-ssd1306`), relay, servo, LED, push button (6 mm), WS2812B (`wokwi-led-strip`).
  - Checked against Wokwi's element sources and part docs.
- **No Wokwi part:** Pro Micro, D1 Mini (ESP8266), BME280, BH1750, INA219, and the power parts. These are left out.

Wokwi simulates ESP32, Arduino and many sensors in the browser: your firmware runs on a virtual board, and the sensors, LEDs, displays and serial output respond.

- **Export** a design as Wokwi's `diagram.json`:
  - Each placement becomes a Wokwi part (`Part.wokwi_type`), positioned from the canvas.
  - Each wire becomes a connection (`ref:pin`, using `Pin.wokwi_name` where it differs), in its colour.
- **Parts without a `wokwi_type`** can't be simulated. The export lists them and leaves them out.
- **How to run it:**
  - Open the export in the Wokwi web editor, or the Wokwi VS Code extension.
  - Or run headless with `wokwi-cli` for Claude-driven test runs. This needs a Wokwi token; check the current free-tier limits first.
- **Firmware** comes from the next section, so a design can go from canvas to running simulation.

Keep this in mind throughout phase 1: a design must convert to `diagram.json` without losing anything.

### Firmware from a design

- **ESPHome YAML for ESP32 designs.** The user already runs HA, so this is the natural target. Claude takes the design's nets (which sensor on which pins, I2C buses, addresses) and writes the config.
- **Arduino and PlatformIO code** for everything else (Uno, Nano, Pro Micro, and ESP32s not running ESPHome). Claude writes the sketches; the app supplies what code needs from the design, so firmware never hard-codes a GPIO number. Planned as build steps 10–13 (decided 2026-11-07, below).
- **Hand-off:** the generated firmware is stored on the design as an attachment or a revision note.

**Boards in mind:** ESP32 variants, Arduino Uno, Nano and Pro Micro. No Raspberry Pi or Pico for now, so pin naming rules cover those families only.

**Step 10: pin map.** The base for everything below.
- **`Pin.code_name`** (nullable): what code calls a board pin. When empty it comes from the pin's name: `GPIO21` → `21`, `D2` → `2`, `A0` → `A0`. Other names (`3V3`, `RST`, `TX`) have no code name. Set it by hand only where the rule is wrong. Pin editor field; starter boards checked against the rule.
- **Add an Arduino Pro Micro (ATmega32U4, 5 V)** to the starter set, pins named `D2`… and `A0`… like the Uno.
- **`modules/firmware/`:** a pure function from a design to a pin map. For every part wired to the board: each signal pin as `REF_PIN` → the board pin's code name (`BME_SDA = 21`), its I2C address (`BME_ADDR = 0x76`, the first in `i2c_addresses`), and the buses it uses (I2C, SPI, UART). Board pins with `strapping`, `flash`, `adc2` or `input_only` flags get a comment. Parts not wired to a board pin, and unwired pins, are listed as comments. A design with more than one board takes a `board` ref; with one, it's found.
- **Formats:**
  - C++ `pins.h`: `#pragma once`, `constexpr uint8_t` values, a header comment naming the design, its revision time and "generated, don't edit".
  - MicroPython `pins.py`: only when every code name is a plain number (ESP32 boards). Otherwise it's refused with the reason.
- **Where to get it:** `GET /api/designs/{id}/pinmap?lang=c|py` (JSON with the text and filename), a "Pin map" dialog in the design header's ⋯ menu (copy, download), and an MCP tool `get_pin_map(design_id, lang, board?)`.
- Only `/mcp` is reachable from outside Ingress, so a build script on the laptop can't fetch the map. You download it in the app, or Claude Code writes it into the firmware repo through MCP.

**Built in step 10 (2026-11-07):**
- `Pin.code_name` with its migration; the API returns each pin's `default_code_name` beside it. The pin editor shows the field in a pin's details, with the rule's answer as its placeholder.
- `backend/app/modules/firmware/`: `pinmap.build` and `render`, `GET /api/designs/{id}/pinmap`, and the MCP tool `get_pin_map`. Tested in `tests/test_firmware.py`.
- **How a pin is mapped:** a part's signal pin (not power, ground or `nc`) on a net with one of the board's signal pins becomes `REF_PIN`. A board pin with no code name of its own takes a tied pin's, so the Uno's `SDA` maps to `A4`. When a net reaches the board on several pins, the first by name is used and the rest are listed in the comment. Pins not wired, or not wired to the board, are listed as comments, and so is a board pin with no code name.
- **Buses:** `I2C_SDA`/`I2C_SCL` and `SPI_SCK`/`SPI_MOSI`/`SPI_MISO` from the roles of the parts' pins; several different buses are numbered (`I2C0_SDA`, `I2C1_SDA`). UART and chip select stay per part.
- **No timestamp** in the header, so the same design always gives the same text (step 13 compares them). It names the design, the board and any unverified parts.
- The **Pin map** dialog is in the design header's ⋯ menu rather than in the inspector, next to History.
- **Arduino Pro Micro (5 V)** added to the starter parts (22 now).

**Step 11: bring-up sketch.** An Arduino `.ino` generated from the pin map that checks the physical build matches the design, with no libraries:
- Scans each I2C bus and reports each expected address as found or missing, per part.
- Toggles LEDs, relays and other actuators on `gpio` pins, one at a time.
- Reads buttons and digital inputs, and prints analog pins.
- Prints a pass or fail line per part on the serial monitor. Waits up to a few seconds for the serial port, for native-USB boards (Pro Micro, ESP32-C3).
- Includes `pins.h`. Same three routes as the pin map (`/bringup`, a button, `get_bringup_sketch`).

**Built in step 11 (2026-11-08):**
- `backend/app/modules/firmware/bringup.py`, built on the pin map. `GET /api/designs/{id}/bringup` and the MCP tool `get_bringup_sketch` return `bringup.ino` and the `pins.h` it includes; a **Bring-up sketch** dialog in the design's ⋯ menu shows both, with Copy and Download.
- **What it does, in order:** I2C parts are probed at each of their addresses (`Wire`, and `Wire1` for a second bus on an ESP32; AVR boards use their own SDA/SCL); actuator and display pins blink three times; other parts' pins are watched for 5 s with the pull-up on while you trigger them; analog pins are read for 3 s and their range printed. It ends with passed, failed and to-check-by-eye counts.
- **What it never drives:** only pins of `actuator` and `display` parts are outputs. A board pin flagged `flash` or `input_only`, or shared by more than one part, is never driven. SPI and UART pins are listed as needing the part's library. Parts like the DHT22 or HC-SR04, which only answer when asked, report "didn't change" with that hint.
- **Starter push button** is now kind `other`, not `actuator`, since the sketch drives actuators. A library that already has it needs its kind changed in the app.
- Tests syntax-check generated sketches with `g++` against a small Arduino stub (`tests/arduino_stub/`), for ESP32 and AVR.

**Step 12: library hints.**
- **`Part.libraries`** (JSON list of PlatformIO library ids, e.g. `adafruit/Adafruit BME280 Library@^2.2`), edited on the part page and through `update_part`. Starter parts get theirs.
- A design gives a `platformio.ini` `lib_deps` block from its parts. No stored setup snippets: Claude writes `setup()` from the part and its library.

**Built in step 12 (2026-11-08), with two additions agreed before starting:**
- **A whole `platformio.ini`, not just `lib_deps`:** boards get `platform` (`espressif32`, `espressif8266`, `atmelavr`) and `platformio_board` (e.g. `esp32dev`, `uno`, `nanoatmega328`, `sparkfun_promicro16`, `esp32-c3-devkitm-1`, `d1_mini`). The file has `[env:<board ref>]` with platform, board, `framework = arduino` and `monitor_speed = 115200`; ESP32 boards with native USB (C3, S2, S3, C6, H2 in the board id) get a commented `ARDUINO_USB_CDC_ON_BOOT` line to uncomment. A board missing either field still gets a file, with those lines blank and a note saying where to set them.
- **Libraries per platform:** each entry is `{spec, platforms}`, empty platforms meaning all. The file lists the ones for the board's platform and, in a comment, the ones it left out. Other boards in the design and their libraries are skipped.
- Comments in the file say which parts need each library, and give the plain names for the Arduino IDE's Library Manager.
- `GET /api/designs/{id}/platformio`, the MCP tool `get_platformio_project`, and a **PlatformIO project** dialog in the design's ⋯ menu (sharing the bring-up sketch's dialog). The part page has Platform and PlatformIO board fields for boards, and a Libraries list under the description.
- **Starter data:** the six boards have their platform and board id; BME280, DHT22, DS18B20, BH1750, INA219, SSD1306, SG90 and WS2812B have their libraries. **Starter parts** also fills these fields on library parts with the same name where they're empty, and never overwrites them, so libraries added before step 12 catch up.
- Versions are pinned to the major version (`^2.2`).

**Step 13: firmware link and drift check.**
- **`Design.firmware_repo`** (text: a local path or a URL), shown in the inspector and set through `update_design`.
- **Drift check:** the firmware includes the generated `pins.h`, so checking for drift means regenerating it and comparing. The MCP instructions tell Claude Code to do that before changing pin-related code, and to say what moved.

**Built in step 13 (2026-11-08):**
- `Design.firmware_repo` with its migration: one line, up to 500 characters, blank clears it. In the inspector under the Shelf-help project (with a link when it's a URL; shown read-only on phones), on `create_design` and `update_design`, and in every design answer.
- **The comparison is done by the app, not by Claude diffing text:** `POST /api/designs/{id}/pinmap/compare` and the MCP tool `compare_pin_map` take a firmware's `pins.h` or `pins.py` and list the constants whose value changed (with the pin they're on now), the ones newly wired, and the ones no longer in the design, plus the current file to replace it with. It reads `constexpr` and `#define` lines, or `NAME = value` for Python, so hand-written headers work too; hex values compare ignoring case.
- **The generated header names its design and board** ("Ohm Sweet Ohm design 3, board esp"), so Claude can find the design from the repo alone.
- The MCP instructions tell Claude to run `compare_pin_map` before changing pin-related code in a firmware with a generated pin map, report what moved, replace the file and fix code that used changed or removed constants.

Wokwi export stays its own item above. It reuses step 10's code names and bus data.

## Protoboard layouts (decided 2026-11-08, build steps 14–19)

Laying parts out on a protoboard is the hard part of building one. A **layout** places a design's parts on a physical board, and the app checks it against the design's nets. The layout canvas offers cut and jumper tools, and Claude places, cuts and adds jumpers over MCP, with the check as its feedback.

**Boards in mind:** the user's 24 × 37 single-sided stripboard, with 24 strips running along the long side, and a breadboard-pattern protoboard. Both are fixed copper patterns, so one engine covers them. Plain perfboard (a pad per hole, needing real routing) and double-sided boards come later.

### Principles

- **A layout belongs to a design and holds only physical facts:**
  - which of the design's placements are on the board, and where;
  - the board's type and size;
  - cuts, jumpers and connectors.
- **The design owns connectivity.** The layout never changes nets. If a different GPIO would save jumpers, the schematic's wire is changed (by the user, or by Claude with their OK), and the layout follows.
- **The layout places the design's own placements, never copies:** `esp` on the board *is* `esp` in the schematic. A design can have several layouts ("Stripboard v1", a smaller v2).
- **Board connectivity and layout checks are computed, never stored,** as with nets and design checks.
- **Every change to a layout through MCP saves a layout revision first.** Layouts have their own revisions and undo, as designs do.
- **Layout objects never reach the design:** connectors, cuts and jumpers stay out of it, so `diagram.json` and the pin map are unchanged.

### Footprints (step 14)

A layout needs each pin's physical hole, which a part's sides and order don't give. **Everything is in millimetres** (decided 2026-11-08): a protoboard's holes are 2.54 mm apart, and lengths that aren't on that grid (a tactile switch's 6.5 × 4.5 mm legs, a 3.5 mm terminal) can be stored as they are and flagged, rather than rounded to a grid.
- **`Pin.x_mm`, `Pin.y_mm`** (nullable, both or neither): the pin's hole in mm from the part's origin, usually its first pin, in the top view with x to the right and y down. Kept to 0.01 mm.
- **`Part.body_mm`** (nullable): the outline the part covers on a board, `{x, y, w, h}` in mm from the same origin. Holes under it are blocked for a soldered part.
- **A part can go on a board when every pin that's not NC has a hole on the 2.54 mm grid,** measured from its first hole. Pins with no hole, such as a relay module's screw terminals, mean the part must stay off board.
- **Footprint editor** on the part page:
  - **Generate from sides:** left pins become a column, right pins a column the given distance away in mm (15.24 for a Nano), and top and bottom pins become rows. Pitch is 2.54 mm by default.
  - Hand-editing of holes and the outline, and a preview of them on a 2.54 mm grid, with any off-grid holes marked.
- **Starter parts** get footprints from the makers' drawings and stay unverified until checked against the real board. ESP32 DevKit clones differ (22.86 or 25.4 mm between headers): the notes say to measure.

**Built in step 14 (2026-11-08):**
- **Data:** `Pin.x_mm`/`y_mm` and `Part.body_mm`, with a migration.
- **API:**
  - `PUT /parts/{id}/footprint` sets the whole footprint: the body, plus holes by pin id. Pins left out get none, and two pins in one hole is refused.
  - `GET /parts/{id}/footprint/from-sides?span_mm=&pitch_mm=` proposes a footprint without saving it.
  - The pin editor's saves keep each pin's hole: a pin sent without `x_mm` keeps the one it has.
  - Copying a part copies its footprint.
- **Generation** (`parts/footprint.py`): parts with pins on both the sides and the top or bottom are refused, to be placed by hand. In the editor, generating keeps an outline already entered; otherwise it proposes one 1.27 mm around the pins.
- **Starter footprints:**
  - ESP32 DevKit V1 (22.86 mm, with a note to measure), C3 SuperMini, Nano and Pro Micro (15.24 mm), D1 Mini (22.86 mm).
  - BME280, BH1750, INA219, SSD1306.
  - DHT22 (its upright base), DS18B20 (legs spread to 2.54 mm), LED, push button (7.62 × 5.08 mm, legs bent to fit).
  - None for the Uno (its headers are off the grid), HC-SR04, PIR, relay, servo, LED strip or the power parts, which stay off board.
  - Starter parts fills in a footprint for a library part with none at all whose pins all match by name; a footprint you've started is never touched.
- **MCP:** `set_footprint(part_id, holes | from_sides, body_mm?)` by pin name, and `create_part` takes `body_mm` and pins' `x_mm`/`y_mm`. A change by Claude sets the part unverified.

### Layout model (step 15)

```
Layout       id, design_id, name, board_type (stripboard | breadboard),
             strips (24), holes (37), notes, created_at, updated_at
LayoutPart   layout_id, placement_id (cascade), on_board (bool),
             strip, hole (the origin's position; null when off board),
             rotation (0/90/180/270), mount (socketed | soldered)
Cut          layout_id, strip, hole, between (false: at the hole;
             true: between this hole and the next)
Jumper       layout_id, a_strip, a_hole, b_strip, b_hole, side (top | bottom),
             insulated (bool), color
Connector    layout_id, ref (J1…), type, pin_count, strip, hole, rotation
ConnectorPin connector_id, index (1…), placement_id, pin_id (the off-board
             pin this one carries; nullable)
LayoutRevision  layout_id, created_at, author, summary, snapshot (JSON)
```

- **Coordinates match the physical board:** strips are lettered A–X and holes numbered 1–37, so a position reads **C14**. Positions are named this way everywhere: the canvas, check messages, MCP tools and the printed lists.
- **A design placement can be on the board, off board, or not placed yet.**
  - Not placed yet: it has no `LayoutPart`.
  - Off board: `on_board` is false, as for a sensor on a cable. Its connections then need a connector.
- **Mount:**
  - Socketed (in female headers): the default for boards like the ESP32 and Nano. Holes under the body stay usable for top jumpers and low parts, and the parts list adds the headers.
  - Soldered: the default for everything else. Holes under the body are blocked on top.
- **Cuts:** at a hole by default, removing that hole's copper (a spot-face cutter). Between two holes is also supported (a knife cut), and saves a hole.
- **Jumpers:**
  - **Top:** insulated wire on the component side, through two holes that must be free.
  - **Bottom:** a wire or solder blob on the copper. It can share a hole with a leg. It touches every strip it lies across unless marked insulated; a one-hole link is a solder bridge between neighbouring strips.
- **Connectors** are generic, typed by their footprint:

  | Type | Pitch |
  |---|---|
  | Male or female pin header (the default) | 2.54 mm |
  | JST-XH | 2.5 mm, fitted to the 2.54 mm grid |
  | Screw terminal | 5.08 mm, every other hole |

  - 3.5 mm terminals don't fit the grid and are left out.
  - Each connector pin is assigned to an off-board pin, so the cable is explicit.
- **Breadboard pattern:** the same model with fixed copper: groups of five each side of the gap, and power rails along both edges. There's no cut tool. The user's board is 62 holes long.
- **When the design changes:**
  - A removed placement leaves its layouts.
  - A new wire is a missing connection.
  - A changed footprint is flagged on every layout using that part.

### Board connectivity and layout checks (step 15)

Connectivity is worked out by union-find over holes:
- strip segments, split by cuts;
- the breadboard's fixed groups;
- jumpers and bottom links;
- each pin's hole, joined to its part's ground pins and tied pins as in the design's nets;
- connector pins, joined to the off-board pins they carry.

Then it's compared with the design's nets:

| Check | Severity | Fires when |
|---|---|---|
| `layout_missing` | error | two pins on one design net aren't connected on the board |
| `layout_short` | error | one board connection joins two design nets, e.g. "strip C joins GND and 3V3: cut it between C9 and C11" |
| `layout_overlap` | error | two parts, or a part and a connector, need the same hole |
| `layout_off_edge` | error | a part, connector or jumper goes past the board's edge |
| `cut_under_pin` | error | a cut at a hole with a leg in it |
| `under_body` | error | a part or top jumper on a hole under a soldered part's body |
| `jumper_hole_taken` | error | a top jumper's end on a hole with a leg or another jumper |
| `diagonal_jumper` | note | a jumper that isn't straight along a strip or across strips |
| `unassigned_connector_pin` | warning | a connector pin carrying nothing |
| `off_board_unconnected` | warning | an off-board part's connection with no connector pin |
| `layout_out_of_date` | warning | a part's footprint changed after it was placed |
| `no_footprint` | error | a part on the board has a pin (not NC) with no hole (added in step 15) |
| `off_grid` | error | a part's holes aren't on the 2.54 mm grid (added in step 15) |
| `connector_not_placed` | warning | a connector that isn't on the board yet (added in step 15) |

A summary gives jumper count, total jumper length, cuts and board area used, as the score to improve.

**Built in step 15 (2026-11-08)**, in `backend/app/modules/layouts/`, through the API only:

- **Data:** the tables above, with a migration. `LayoutPart` also stores `footprint_sig`, a fingerprint of the part's footprint when it was last placed or moved. That's how `layout_out_of_date` notices a change; moving the part, even in place, confirms the new footprint.
- **Positions** are 1-based, with strip 1 as A, and are sent as numbers; answers add labels like `C14` (`board.label`/`parse_label`, AA after Z).
- **Geometry** (`board.py`):
  - A footprint in mm is turned clockwise about its origin, then laid on holes 2.54 mm apart: x along the strips, y across them.
  - A hole within 0.1 mm of the grid counts as on it.
  - A body becomes a box in fractional holes. A hole is under it when strictly inside.
  - Connectors: pin 1 at the connector's position, the rest one hole apart (two for 5.08 mm terminals), turned like parts.
- **Connectivity:**
  - Every hole is a node (its solder joint). Copper joins neighbouring holes; a cut at a hole removes that hole's copper but not its joint.
  - A bare bottom link touches every hole on its straight path; a top jumper or insulated link touches only its ends.
  - **A pin that isn't wired in the design counts as its own net,** so a GPIO left on a GND strip is reported as a short. The pins of a part joined inside it share one, so its two GND pins on different strips are fine.
- **Short messages suggest a cut:** for two nets on one stripboard strip, the free hole midway between them ("cut at B4"), or a cut between holes when none is free.
- **The ratsnest** (`links`): a missing net's pieces joined nearest first, as a minimum spanning tree, so the canvas can draw the fewest lines.
- **Off-board pins** need a connector only when their net reaches the board: a servo powered by a USB supply, both off board, needs none.
- **Bodies:**
  - Two bodies may overlap only when one part is socketed and the other soldered (the low part sits under the raised one).
  - A soldered body blocks other pins, connector pins and top jumper ends under it, including a jumper right beside a 5 mm LED's leg, under its rim.
- **Sizes:**
  - A stripboard defaults to 24 × 37.
  - A breadboard pattern is always 14 rows: rails on rows 1–2 and 13–14, blocks of five on rows 3–7 and 8–12. It defaults to 62 holes, the user's full-size board (confirmed 2026-11-08), and its cuts are refused.
- **API:**
  - `GET/POST /designs/{id}/layouts`.
  - `GET/PATCH/DELETE /layouts/{id}`.
  - `PUT /layouts/{id}/parts` places, moves or takes parts off the board; a move without a rotation keeps the current one. `DELETE …/parts/{placement_id}` sets a part back to not placed.
  - `POST …/cuts` (a batch) and `DELETE …/cuts/{id}`.
  - `POST/PATCH/DELETE …/jumpers`. The default colour is blue on top and grey underneath.
  - `POST/PATCH/DELETE …/connectors`, named J1, J2… unless given a ref. One off-board pin can be on only one connector pin.
  - `PUT …/snapshot` for undo, and `GET …/revisions` with `POST …/restore`.

  Every change answers with the whole layout: its parts with each pin's hole, the parts not placed (and whether each has a footprint), cuts, jumpers, connectors, copper segments with the nets they carry (for tinting), the ratsnest, the checks and the stats.
- **Revisions:** as for designs. Claude's changes each save one (the service takes a summary, used by step 18), the canvas saves one per editing session, and a restore saves the state first. The latest 50 are kept.
- **Tests** (`tests/test_layouts.py`): geometry, every check, breadboard groups, connectors, undo and revisions, design changes flowing through, and a whole Nano + LED + off-board BME280 build on the 24 × 37 board, from 15 shorts to no errors, warnings or notes.

### The layout canvas (steps 16–17)

**Where:** its own canvas, opened from the design header's view switcher: `Schematic | Stripboard v1 ▾ | + New layout`, at `/designs/:id/layouts/:layoutId`. It uses the same page shell as the design page:
- left: the parts tray;
- right: the Inspector;
- bottom: the layout checks bar.

It isn't drawn on the schematic, because physical and logical drawings make each other worse.

**Drawing:**
- **Orientation:** landscape, with strips running left to right, lettered A–X down the side and numbered 1–37 along the top.
- **Strips are tinted by the net they carry,** worked out live: GND dark, supplies red-ish, unused plain copper. A strip carrying two nets is hatched red.
- **Parts** are drawn as footprints: their body outline, a dot on each hole a pin uses, and their ref.
- **Ratsnest:** thin straight lines for connections the design needs and the board doesn't make yet. Each disappears as it's satisfied.
- **Top and bottom views:**
  - The top view is the default: parts solid, strips faint with their tints, top jumpers solid, cuts and bottom links faint.
  - The **bottom view** is mirrored left to right, as the board looks when turned over to solder: copper, cuts and bottom links solid; parts as solder dots with a faint outline.
  - Labels stay with their holes (C14 is C14 either way), and a marker shows where A1 is.

**Parts tray:** the design's placements grouped as on board, off board and not placed yet. Drag a part onto the board, or mark it off board. Each off-board part lists the connections it needs, and from those the connectors.

**Tools:**

| Tool | Key | Behaviour |
|---|---|---|
| Select / move | V | Drag parts and connectors, which snap to holes. R rotates. A red outline while dragging marks an invalid spot. |
| Cut | C | Click a hole to cut there, or the gap between two holes to cut between them; click a cut to remove it. While hovering, the strip previews its split with updated tints. Cutting a hole with a leg in it is refused, with the reason. |
| Jumper | J | Tap one hole, then another. Top or bottom follows the current view, and can be switched in the Inspector. Esc cancels. |
| Connector | K | Pick a type and pin count, then place it. Assign its pins in the Inspector, or let Claude propose. |

**Helpers:**
- **Cut between header rows:** one click on a part (or by Claude) cuts every strip it spans midway between its two rows.
- **Trim dead copper:** cuts strip ends beyond their last connection. Optional.

**Inspector:**
- A part: its origin position ("pin 1 at C5"), rotation, mount, and the strip each pin is on.
- A strip segment: its net, and what's on it.
- A jumper: its ends, side and colour.
- A connector: its pins and what each carries.

**Carried over from the design canvas:**
- saving straight away through the API;
- undo/redo and History;
- the "Claude changed this layout" notice;
- net highlighting on hover and tap;
- focus;
- a read-only view on phones, for "where does this go?" at the bench.

**Linking back to the schematic:**
- Parts on a layout get a badge ("on Stripboard v1, C5"). A view toggle draws a dashed frame around them.
- "Show on board" and "Show in schematic" jump between the two views with the part selected.
- A highlighted net carries over when switching views.
- The design header shows each layout's state: "Stripboard v1: 2 connections missing, 1 short".

**Built in step 16 (2026-11-08):** the layout page, as described in pages.md (Layout page).
- **The board is SVG,** with its own pan and zoom, rather than React Flow.
- **API additions:**
  - segments say whether they carry a `short` (so a GPIO on a GND strip is drawn hatched too);
  - layout parts return their `footprint_sig`, so undo doesn't mark them out of date;
  - connector pins return their placement and pin ids, for undo;
  - layout summaries list where each placement is (`placed`), for the schematic's badges.
- **Not done yet:**
  - the dashed frame round on-board parts on the schematic;
  - carrying a highlighted net between the two views;
  - focus on the board.

  The cut, jumper and connector tools are step 17.

**Built in step 17 (2026-11-08):** the cut, jumper and connector tools, as described in pages.md (Layout page).
- **Helpers in the API,** for step 18 to reuse:
  - `POST /layouts/{id}/parts/{placement_id}/cut-between-rows` cuts each strip a part spans between neighbouring pins on different nets: at a free hole midway, or between holes when none is free. Tied pins (RST and RST2) and strips already split are left alone.
  - `POST /layouts/{id}/trim` cuts each strip just past its outermost leg, connector pin or jumper end, between holes so no hole is lost. Strips with nothing on them stay whole.

  Both are refused when there's nothing to cut, and on a breadboard pattern.
- **Off-board pins** needing a connector are listed in the part's own pin order.
- **A snapshot part without a footprint fingerprint** takes the current one, rather than being flagged out of date.
- **Not done:** previewing a cut's new strip tints before clicking. The dashed mark shows where it will go, and the tints update as soon as it's made.

### Claude over MCP (step 18)

| Tool | What it does |
|---|---|
| `list_layouts(design_id)`, `create_layout(design_id, name, board_type, strips?, holes?)` | |
| `get_layout(layout_id)` | Everything placed, the connectivity by design net, the checks and summary, and a **text picture** of the board (below) |
| `place_on_board(layout_id, parts: [{ref, at?, rotation?, mount?, off_board?}])` | `at` is a position like `"C5"` for the part's origin. Several parts per call |
| `cut(layout_id, at: ["B4", "C9-10"])`, `uncut(...)` | `"C9-10"` is a cut between holes 9 and 10 |
| `add_jumpers(layout_id, jumpers: [{a, b, side?, insulated?, color?}])`, `remove_jumper(layout_id, a, b)` | |
| `add_connectors(layout_id, connectors: [{type, pins: ["bme.GND", ...], at?, rotation?}])` | Pins are assigned in order |
| `propose_connectors(layout_id)` | Read-only. One connector per off-board part, in the part's own pin order so the cable runs straight, with a type that suits: a screw terminal for a power input, a header otherwise |
| `cut_between_rows(layout_id, ref)` | The helper above |
| `check_layout(layout_id)` | |

Instructions for Claude:
- **Work in loops:** place, check, adjust.
- **Aim** for no errors first, then fewer jumpers, shorter jumpers and less board area.
- **Suggest a schematic change** (a different GPIO) when it would simplify the board, and make it only with the user's OK.
- **Removing** layout objects is allowed (each saves a revision, as `disconnect` does). Deleting a whole layout is for the app.

Text picture: one line per strip, in the top view. Ref letters mark a part's pins, `x` a cut, `|` a cut between holes, digits a jumper's ends, and the strip's net at the end:

```
    1   5    10   15   20   25   30   35
A  ··E··········B···················· GND
B  ··E··x·······B····1··············· 3V3
C  ··E··|··E···························  (two segments)
…
jumpers: 1 B20→F20 (top)   connectors: J1 at T2 (bme)
```

### Export (step 19)

- **Copper side at 1:1** as SVG and a printable page: the bottom view, mirrored, with A–X and 1–37 labels, cuts and bottom links marked. It can be taped to the board.
- **Cut list:** "B4, C9–10, G12 …", in board order for working along the strips.
- **Jumper list:** "1: B20 → F20, top, red, 4 holes".
- **Cable list:** "J1 → bme: GND, VIN, SCL, SDA (straight)".
- **Layout parts list:** female headers for socketed parts, connectors by type and pin count, jumper wire length. A later link could add missing ones to Shelf-help as `need`.

### Later

- Collapsing a layout's parts on the schematic into one block that shows only its connectors (a view, like focus).
- A deterministic auto-placer for a first draft, only if Claude plus the checks fall short.
- Perfboard (needs routing), double-sided boards, and specific connector parts from the library.
- A breadboard view of designs from the same engine.

## Canvas: more ways to tame a busy design

Built: focus, and same-net wires sharing tracks with junction dots (pages.md, Design page). Suggested next, not decided:
- **Power and ground as labels:** a view toggle drawing GND and supply wires as short stubs ending in a net label, instead of full wires. The wires stay in the design.
- **Hide unused pins:** a view toggle showing cards with only their wired pins; routes follow, since they're computed.
- **Find a part** (Ctrl+K) to zoom to and select it; **keyboard nudging** (arrows), Ctrl+A, Ctrl+D to duplicate.
- **Export the canvas** as PNG or SVG.
- **Wire hover tooltip** with the net and both ends.

## Ideas (not decided)

- **Stock status from Shelf-help:** show have/low/out next to parts, and a "ready to build" bar on designs like Shelf-help's readiness. This needs a separate read-only token on Shelf-help that reaches only a narrow stock endpoint, never its full API.
- **Breadboard view:** a realistic breadboard layout as a second view of the same connection list. (Planned to come from the protoboard layout engine; see Protoboard layouts.)
- **Passive values:** resistors and capacitors with values, voltage dividers checked by the rules (e.g. a 5 V echo pin divided down to 3.3 V).
- **Power budget:** current draw per part, summed per supply, checked against the regulator's limit.
- **Pin assignment helper (built 2026-11-08):** for a placed part, `GET /designs/{id}/suggest-wiring?ref=`, the Inspector's Suggest wiring, and the MCP tool `suggest_wiring`.
  - **Shared buses:** I2C and SPI lines join the board pin already carrying them to another part; otherwise they take the board's pin with that role.
  - **Supply:** taken from any power_out pin in the design within the part's supply range, the board's own first.
  - **Ground:** the board's least-used ground pin.
  - **UART:** crossed, on a spare UART before the USB serial.
  - **Signals:** go to free GPIOs, never flash, input-only or the main UART pins. Strapping and boot pins come last, then pins with bus roles, then analog pins (kept free for analog parts).
  - **Analog:** prefers input-only pins and avoids ADC2 on ESP32.
  - **Warnings:** a 5 V signal into a lower-rated pin gets one.
  - **Left to the user:** kind other, enable, reset and supply pins.
  - Later: "add a BME280" picking the part too, and placing it near its pins.
- **Part import:** from Fritzing `.fzpz` or Wokwi element definitions, licence permitting.
- **Bill of materials:** a design's parts as a list, with one tap to add the missing ones to Shelf-help as `need`.
