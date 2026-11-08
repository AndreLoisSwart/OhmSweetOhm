"""The bring-up sketch (build step 11): an Arduino sketch that checks a built circuit
against its design, with no libraries. It includes the design's `pins.h`.

What it tests, in this order:
1. I2C parts: each answers at one of its addresses on its bus.
2. Actuators and displays: their pins are blinked, for you to watch.
3. Other parts' digital pins: watched for a change while you trigger the part.
4. Analog pins: read for a few seconds, lowest and highest value printed.

Only actuator and display pins are ever driven; everything else is only read, so a
sensor's output is never fought. SPI and UART pins are skipped: they need the part's own
library to test.
"""

import re
from dataclasses import dataclass, field

from app.modules.designs.models import Design
from app.modules.firmware.pinmap import Constant, PinMap, build
from app.modules.parts.models import PartKind, PinFlag, PinKind

FILENAME = "bringup.ino"
# Parts the sketch may drive. A button is not one: it's read (docs/data-model.md).
DRIVEN = {PartKind.ACTUATOR, PartKind.DISPLAY}
LIBRARY_ROLES = (
    PinKind.SPI_MOSI,
    PinKind.SPI_MISO,
    PinKind.SPI_SCK,
    PinKind.SPI_CS,
    PinKind.UART_TX,
    PinKind.UART_RX,
)
NOT_WATCHED = {PinKind.ENABLE, PinKind.RESET}
WATCH_MS = 5000
ANALOG_MS = 3000

HELPERS = """\
static int passed = 0, failed = 0, toCheck = 0;

static bool i2cFound(TwoWire &bus, uint8_t address) {
  bus.beginTransmission(address);
  return bus.endTransmission() == 0;
}

static void blink(uint8_t pin) {
  pinMode(pin, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(pin, HIGH);
    delay(300);
    digitalWrite(pin, LOW);
    delay(300);
  }
  pinMode(pin, INPUT);
}

// True if the pin changes level within ms. Pulled up, so an open switch reads steady.
static bool changes(uint8_t pin, unsigned long ms) {
  pinMode(pin, INPUT_PULLUP);
  delay(5);
  int first = digitalRead(pin);
  unsigned long start = millis();
  while (millis() - start < ms) {
    if (digitalRead(pin) != first) return true;
    delay(2);
  }
  return false;
}

static void analogRange(uint8_t pin, unsigned long ms) {
  int low = 32767, high = -1;
  unsigned long start = millis();
  while (millis() - start < ms) {
    int v = analogRead(pin);
    if (v < low) low = v;
    if (v > high) high = v;
    delay(5);
  }
  Serial.print(low);
  Serial.print(F(" to "));
  Serial.println(high);
}
"""


def c_text(text: str) -> str:
    """Text safe inside a C string literal, in plain ASCII."""
    text = text.replace("\\", "\\\\").replace('"', '\\"')
    return re.sub(r"[^\x20-\x7e]", "?", text)


def say(text: str) -> str:
    return f'  Serial.println(F("{c_text(text)}"));'


@dataclass
class Phases:
    i2c: list[str] = field(default_factory=list)
    blink: list[str] = field(default_factory=list)
    watch: list[str] = field(default_factory=list)
    analog: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    # I2C buses by (SDA, SCL) constant names, in the order found.
    buses: list[tuple[str, str]] = field(default_factory=list)


def _bus_index(phases: Phases, sda: Constant, scl: Constant) -> int:
    for i, (bus_sda, bus_scl) in enumerate(phases.buses):
        # Same board pins: the same bus, even through another part's constants.
        if (bus_sda, bus_scl) == (sda.value, scl.value):
            return i
    phases.buses.append((sda.value, scl.value))
    return len(phases.buses) - 1


def _plan(pin_map: PinMap) -> tuple[Phases, dict[int, tuple[str, str]]]:
    phases = Phases()
    bus_pins: dict[int, tuple[str, str]] = {}  # bus index → the first part's SDA/SCL names
    # Board pins more than one part is on: never driven, in case the other part drives it.
    users: dict[str, set[str]] = {}
    for block in pin_map.blocks:
        for c in block.constants:
            if c.pin:
                users.setdefault(c.value, set()).add(block.placement.ref)

    for block in pin_map.blocks:
        placement = block.placement
        part = placement.part
        ref = placement.ref
        pins = [c for c in block.constants if c.pin and c.board_pin]
        # Unwired pins (a relay's contacts, say) are listed in pins.h; only pins wired
        # somewhere other than the board are worth a line here.
        for note in block.notes:
            if not note.endswith(" isn't wired"):
                phases.skipped.append(f"SKIP  {note}")

        sda = next((c for c in pins if c.pin.has_role(PinKind.I2C_SDA)), None)
        scl = next((c for c in pins if c.pin.has_role(PinKind.I2C_SCL)), None)
        if part.i2c_addresses:
            if sda and scl:
                bus = _bus_index(phases, sda, scl)
                bus_pins.setdefault(bus, (sda.name, scl.name))
                phases.i2c.append(_i2c_test(ref, part.i2c_addresses, bus))
            else:
                phases.skipped.append(f"SKIP  {ref}: SDA and SCL aren't both on the board")
        rest = [c for c in pins if c is not sda and c is not scl]

        library = [c for c in rest if any(c.pin.has_role(k) for k in LIBRARY_ROLES)]
        if library:
            names = ", ".join(c.pin.key for c in library)
            phases.skipped.append(f"SKIP  {names}: SPI/UART, test with the part's library")
        for c in rest:
            if c in library:
                continue
            key, board_key = c.pin.key, c.board_pin.key
            flags = set(c.board_pin.pin.flags)
            if PinFlag.FLASH in flags:
                phases.skipped.append(f"SKIP  {key}: {board_key} is a flash pin")
                continue
            if part.kind in DRIVEN:
                if PinFlag.INPUT_ONLY in flags:
                    phases.skipped.append(f"SKIP  {key}: {board_key} is input only")
                elif len(users[c.value]) > 1:
                    others = ", ".join(sorted(users[c.value] - {ref}))
                    phases.skipped.append(f"SKIP  {key}: {board_key} is shared with {others}")
                else:
                    phases.blink += [
                        say(f"LOOK  {key} ({board_key}): blinking 3 times"),
                        f"  blink({c.name});",
                        "  toCheck++;",
                    ]
            elif c.pin.kind == PinKind.ANALOG:
                phases.analog += [
                    f'  Serial.print(F("INFO  {c_text(key)} ({c_text(board_key)}) reads "));',
                    f"  analogRange({c.name}, {ANALOG_MS});",
                ]
            elif c.pin.kind in NOT_WATCHED and not c.pin.has_role(PinKind.GPIO):
                phases.skipped.append(f"SKIP  {key}: not a signal the sketch can check")
            else:
                phases.watch += [
                    say(f"....  {key} ({board_key}): trigger {ref} now ({WATCH_MS // 1000} s)"),
                    f"  if (changes({c.name}, {WATCH_MS})) {{",
                    "  " + say(f"PASS  {key} changed"),
                    "    passed++;",
                    "  } else {",
                    "  " + say(f"CHECK {key} didn't change: trigger {ref}, or use its library"),
                    "    toCheck++;",
                    "  }",
                ]
    return phases, bus_pins


def _i2c_test(ref: str, addresses: list[int], bus: int) -> str:
    listed = ", ".join(f"0x{a:02X}" for a in addresses)
    alternatives = " or ".join(f"0x{a:02X}" for a in addresses)
    wire = "Wire" if bus == 0 else "Wire1"
    lines = [
        "  {",
        f"    const uint8_t addresses[] = {{{listed}}};",
        "    int found = -1;",
        "    for (uint8_t a : addresses)",
        "      if (found < 0 && i2cFound(" + wire + ", a)) found = a;",
        "    if (found >= 0) {",
        f'      Serial.print(F("PASS  {c_text(ref)} answers at 0x"));',
        "      Serial.println(found, HEX);",
        "      passed++;",
        "    } else {",
        "    " + say(f"FAIL  {ref}: nothing at {alternatives} (check SDA, SCL, power)"),
        "      failed++;",
        "    }",
        "  }",
    ]
    if bus == 0:
        return "\n".join(lines)
    if bus == 1:
        # A second bus: only ESP32s have Wire1.
        return "\n".join(
            [
                "#if defined(ESP32)",
                *lines,
                "#else",
                say(f"SKIP  {ref}: on a second I2C bus, which needs an ESP32"),
                "#endif",
            ]
        )
    return say(f"SKIP  {ref}: on a third I2C bus; test it on its own")


def render(pin_map: PinMap) -> str:
    phases, bus_pins = _plan(pin_map)
    board = pin_map.board
    design = pin_map.design
    lines = [
        f"// Bring-up test for {design.name} on {board.ref} ({board.part.name}).",
        "// Generated by Ohm Sweet Ohm. It checks the circuit you built against the design,",
        "// with no libraries: I2C parts answer at their addresses, actuator and display",
        "// pins blink, other parts' pins are watched while you trigger them, analog pins",
        "// are read. Only actuator and display pins are driven; the rest are only read.",
        "//",
        "// Arduino IDE: save it as bringup/bringup.ino with pins.h beside it.",
        "// PlatformIO: save it as src/main.cpp with pins.h in src/.",
        "// Open the serial monitor at 115200 baud; press reset to run it again.",
    ]
    if pin_map.unverified:
        lines.append(
            f"// Unverified parts, check their pins first: {', '.join(pin_map.unverified)}"
        )
    lines += ["", "#include <Arduino.h>", "#include <Wire.h>", '#include "pins.h"', ""]
    lines += [HELPERS, "void setup() {", "  Serial.begin(115200);"]
    lines += [
        "  // Native-USB boards (Pro Micro, ESP32-C3/S3) need a moment for the port.",
        "  unsigned long waited = millis();",
        "  while (!Serial && millis() - waited < 3000) {",
        "  }",
        "  delay(500);",
        say(f"Bring-up test: {design.name} on {board.ref}"),
    ]
    if phases.i2c:
        lines += ["", "  // 1. I2C parts"]
        for bus, (sda, scl) in sorted(bus_pins.items()):
            if bus == 0:
                lines += [
                    "#if defined(ESP32) || defined(ESP8266)",
                    f"  Wire.begin({sda}, {scl});",
                    "#else",
                    "  Wire.begin();  // this board's own SDA and SCL pins",
                    "#endif",
                ]
            elif bus == 1:
                lines += ["#if defined(ESP32)", f"  Wire1.begin({sda}, {scl});", "#endif"]
        lines += phases.i2c
    if phases.blink:
        lines += ["", "  // 2. Actuators and displays: watch them"] + phases.blink
    if phases.watch:
        lines += ["", "  // 3. Inputs: trigger each part when asked"] + phases.watch
    if phases.analog:
        lines += ["", "  // 4. Analog pins"] + phases.analog
    if phases.skipped:
        lines += ["", "  // Not tested"] + [say(text) for text in phases.skipped]
    if not (phases.i2c or phases.blink or phases.watch or phases.analog):
        lines.append(say("Nothing to test: wire some parts to the board first."))
    lines += [
        "",
        '  Serial.print(F("Done: "));',
        "  Serial.print(passed);",
        '  Serial.print(F(" passed, "));',
        "  Serial.print(failed);",
        '  Serial.print(F(" failed, "));',
        "  Serial.print(toCheck);",
        '  Serial.println(F(" to check by eye."));',
        "}",
        "",
        "void loop() {}",
    ]
    return "\n".join(lines) + "\n"


def sketch(design: Design, board_ref: str | None = None) -> tuple[PinMap, str]:
    pin_map = build(design, board_ref)
    return pin_map, render(pin_map)
