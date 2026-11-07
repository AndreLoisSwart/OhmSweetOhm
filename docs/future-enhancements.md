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
- **Arduino sketches** where ESPHome doesn't fit.
- **Hand-off:** the generated firmware is stored on the design as an attachment or a revision note.

## Ideas (not decided)

- **Stock status from Shelf-help:** show have/low/out next to parts, and a "ready to build" bar on designs like Shelf-help's readiness. This needs a separate read-only token on Shelf-help that reaches only a narrow stock endpoint, never its full API.
- **Breadboard view:** a realistic breadboard layout as a second view of the same connection list.
- **Passive values:** resistors and capacitors with values, voltage dividers checked by the rules (e.g. a 5 V echo pin divided down to 3.3 V).
- **Power budget:** current draw per part, summed per supply, checked against the regulator's limit.
- **Pin assignment helper:** given parts to connect, suggest free board pins that avoid strapping, flash and ADC2 pins.
- **Part import:** from Fritzing `.fzpz` or Wokwi element definitions, licence permitting.
- **Bill of materials:** a design's parts as a list, with one tap to add the missing ones to Shelf-help as `need`.
