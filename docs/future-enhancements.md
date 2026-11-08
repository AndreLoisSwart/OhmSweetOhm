# Future enhancements

## Phase 2 (decided in principle)

### Simulation through Wokwi

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

**Step 13: firmware link and drift check.**
- **`Design.firmware_repo`** (text: a local path or a URL), shown in the inspector and set through `update_design`.
- **Drift check:** the firmware includes the generated `pins.h`, so checking for drift means regenerating it and comparing. The MCP instructions tell Claude Code to do that before changing pin-related code, and to say what moved.

Wokwi export stays its own item above. It reuses step 10's code names and bus data.

## Ideas (not decided)

- **Stock status from Shelf-help:** show have/low/out next to parts, and a "ready to build" bar on designs like Shelf-help's readiness. This needs a separate read-only token on Shelf-help that reaches only a narrow stock endpoint, never its full API.
- **Breadboard view:** a realistic breadboard layout as a second view of the same connection list.
- **Passive values:** resistors and capacitors with values, voltage dividers checked by the rules (e.g. a 5 V echo pin divided down to 3.3 V).
- **Power budget:** current draw per part, summed per supply, checked against the regulator's limit.
- **Pin assignment helper:** given parts to connect, suggest free board pins that avoid strapping, flash and ADC2 pins.
- **Part import:** from Fritzing `.fzpz` or Wokwi element definitions, licence permitting.
- **Bill of materials:** a design's parts as a list, with one tap to add the missing ones to Shelf-help as `need`.
