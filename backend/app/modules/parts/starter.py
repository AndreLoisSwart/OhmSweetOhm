"""The starter parts (docs/mvp.md, build step 8): common modules to begin a library with.

Typed by Claude from the makers' pinouts, never copied from an outside library (see the
licence note in mvp.md). They are added unverified: check each against the real board
and mark it verified in the app.

Pins are listed per side in header order (left and right top to bottom, top and bottom
left to right), as the card draws them. Board pins are named by the chip's GPIO where
there is one, with the silkscreen label in the notes. Arduino boards use D2 and A0, so
every board pin gets its code name from the name rule (models.default_code_name).
"""

from app.modules.parts.footprint import PITCH_MM, from_sides
from app.modules.parts.models import PinSide
from app.modules.parts.schemas import PartCreate

CHECK = "Typed from the maker's pinout by Claude. Check it against your board before relying on it."


def pin(side: str, name: str, kind: str = "gpio", **fields) -> dict:
    return {"side": side, "name": name, "kind": kind, **fields}


def side(name: str, *pins: tuple) -> list[dict]:
    """Pins along one side, in header order: (name, kind, extra fields)."""
    made = []
    for spec in pins:
        pin_name, kind, extra = spec if len(spec) == 3 else (*spec, {})
        made.append(pin(name, pin_name, kind, **extra))
    return made


def notes(*lines: str) -> str:
    return "\n\n".join([*lines, CHECK])


IN_ONLY = {"flags": ["input_only"]}


def with_footprint(
    part: dict,
    body: tuple[float, float, float, float],
    span_mm: float | None = None,
    pitch_mm: float = PITCH_MM,
    note: str = "",
) -> dict:
    """The part with holes laid out from its pins' sides (footprint.from_sides) and its
    body outline (x, y, w, h), all in mm from its first pin."""
    holes = from_sides([PinSide(p["side"]) for p in part["pins"]], span_mm, pitch_mm)
    pins = [{**p, "x_mm": x, "y_mm": y} for p, (x, y) in zip(part["pins"], holes, strict=True)]
    notes_md = part["notes_md"]
    if note:
        # Before the closing "check it" line.
        head, _, tail = notes_md.rpartition("\n\n")
        notes_md = f"{head}\n\n{note}\n\n{tail}"
    return {
        **part,
        "pins": pins,
        "body_mm": dict(zip("xywh", body, strict=True)),
        "notes_md": notes_md,
    }


# ESP32 DevKit V1 (DOIT, 30 pins), top view with the antenna at the top.
ESP32_DEVKIT_V1 = {
    "name": "ESP32 DevKit V1 (30-pin)",
    "wokwi_type": "wokwi-esp32-devkit-v1",
    "platform": "espressif32",
    "platformio_board": "esp32dev",
    "kind": "board",
    "logic_voltage": "3v3",
    "description": "DOIT ESP32 DevKit V1, the 30-pin version. ESP32-WROOM-32, CP2102 USB.",
    "notes_md": notes(
        "Silkscreen: VP = GPIO36, VN = GPIO39, D2 = GPIO2 and so on; TX0/RX0 = GPIO1/3, "
        "TX2/RX2 = GPIO17/16.",
        "GPIO34–39 are input-only. GPIO2, 5, 12 and 15 are strapping pins. ADC2 pins "
        "(GPIO0, 2, 4, 12–15, 25–27) can't read analog while WiFi is on. The flash pins "
        "(GPIO6–11) aren't broken out on the 30-pin board.",
        "VIN takes 5 V (USB or external) into the 3.3 V regulator.",
    ),
    "pins": [
        *side(
            "left",
            ("EN", "enable"),
            ("GPIO36", "analog", {**IN_ONLY, "wokwi_name": "VP"}),
            ("GPIO39", "analog", {**IN_ONLY, "wokwi_name": "VN"}),
            ("GPIO34", "analog", {**IN_ONLY, "wokwi_name": "D34"}),
            ("GPIO35", "analog", {**IN_ONLY, "wokwi_name": "D35"}),
            ("GPIO32", "gpio", {"functions": ["analog"], "wokwi_name": "D32"}),
            ("GPIO33", "gpio", {"functions": ["analog"], "wokwi_name": "D33"}),
            ("GPIO25", "gpio", {"functions": ["analog"], "flags": ["adc2"], "wokwi_name": "D25"}),
            ("GPIO26", "gpio", {"functions": ["analog"], "flags": ["adc2"], "wokwi_name": "D26"}),
            ("GPIO27", "gpio", {"functions": ["analog"], "flags": ["adc2"], "wokwi_name": "D27"}),
            (
                "GPIO14",
                "gpio",
                {"functions": ["analog", "spi_sck"], "flags": ["adc2"], "wokwi_name": "D14"},
            ),
            (
                "GPIO12",
                "gpio",
                {
                    "functions": ["analog", "spi_miso"],
                    "flags": ["adc2", "strapping"],
                    "wokwi_name": "D12",
                },
            ),
            (
                "GPIO13",
                "gpio",
                {"functions": ["analog", "spi_mosi"], "flags": ["adc2"], "wokwi_name": "D13"},
            ),
            ("GND", "ground", {"wokwi_name": "GND.2"}),
            ("VIN", "power_in", {"voltage": 5}),
        ),
        *side(
            "right",
            ("GPIO23", "gpio", {"functions": ["spi_mosi"], "wokwi_name": "D23"}),
            ("GPIO22", "gpio", {"functions": ["i2c_scl"], "wokwi_name": "D22"}),
            ("GPIO1", "uart_tx", {"wokwi_name": "TX0"}),
            ("GPIO3", "uart_rx", {"wokwi_name": "RX0"}),
            ("GPIO21", "gpio", {"functions": ["i2c_sda"], "wokwi_name": "D21"}),
            ("GPIO19", "gpio", {"functions": ["spi_miso"], "wokwi_name": "D19"}),
            ("GPIO18", "gpio", {"functions": ["spi_sck"], "wokwi_name": "D18"}),
            (
                "GPIO5",
                "gpio",
                {"functions": ["spi_cs"], "flags": ["strapping"], "wokwi_name": "D5"},
            ),
            ("GPIO17", "gpio", {"functions": ["uart_tx"], "wokwi_name": "TX2"}),
            ("GPIO16", "gpio", {"functions": ["uart_rx"], "wokwi_name": "RX2"}),
            ("GPIO4", "gpio", {"functions": ["analog"], "flags": ["adc2"], "wokwi_name": "D4"}),
            (
                "GPIO2",
                "gpio",
                {"functions": ["analog"], "flags": ["adc2", "strapping"], "wokwi_name": "D2"},
            ),
            (
                "GPIO15",
                "gpio",
                {
                    "functions": ["analog", "spi_cs"],
                    "flags": ["adc2", "strapping"],
                    "wokwi_name": "D15",
                },
            ),
            ("GND2", "ground", {"wokwi_name": "GND.1"}),
            ("3V3", "power_out", {"voltage": 3.3}),
        ),
    ],
}

# ESP32-C3 SuperMini, top view with the USB-C socket at the top.
ESP32_C3_SUPERMINI = {
    "name": "ESP32-C3 SuperMini",
    "wokwi_type": "board-aitewinrobot-esp32c3-supermini",
    "platform": "espressif32",
    # No board of its own in PlatformIO; Espressif's C3 DevKitM is the usual stand-in.
    "platformio_board": "esp32-c3-devkitm-1",
    "kind": "board",
    "logic_voltage": "3v3",
    "description": "Tiny ESP32-C3 board with USB-C (native USB, no separate serial chip).",
    "notes_md": notes(
        "Silkscreen shows just the GPIO numbers (0–10, 20, 21).",
        "Arduino defaults: I2C SDA = GPIO8, SCL = GPIO9; SPI SCK = 4, MISO = 5, MOSI = 6, "
        "SS = 7; UART RX = 20, TX = 21. GPIO8 also drives the blue LED and GPIO9 is the BOOT "
        "button, and both, with GPIO2, are strapping pins. GPIO0–4 are ADC1; GPIO5 is ADC2.",
    ),
    "pins": [
        *side(
            "left",
            ("5V", "power_in", {"voltage": 5}),
            ("GND", "ground"),
            ("3V3", "power_out", {"voltage": 3.3}),
            ("GPIO4", "gpio", {"functions": ["analog", "spi_sck"]}),
            ("GPIO3", "gpio", {"functions": ["analog"]}),
            ("GPIO2", "gpio", {"functions": ["analog"], "flags": ["strapping"]}),
            ("GPIO1", "gpio", {"functions": ["analog"]}),
            ("GPIO0", "gpio", {"functions": ["analog"]}),
        ),
        *side(
            "right",
            ("GPIO5", "gpio", {"functions": ["analog", "spi_miso"], "flags": ["adc2"]}),
            ("GPIO6", "gpio", {"functions": ["spi_mosi"]}),
            ("GPIO7", "gpio", {"functions": ["spi_cs"]}),
            ("GPIO8", "gpio", {"functions": ["i2c_sda"], "flags": ["strapping"]}),
            ("GPIO9", "gpio", {"functions": ["i2c_scl"], "flags": ["strapping"]}),
            ("GPIO10", "gpio"),
            ("GPIO20", "uart_rx", {"wokwi_name": "RX"}),
            ("GPIO21", "uart_tx", {"wokwi_name": "TX"}),
        ),
    ],
}

# Analog pins that also work as digital pins.
ALSO_GPIO = {"functions": ["gpio"]}

# Arduino Uno R3, top view with the USB socket on the left: the digital header along the
# top edge, the power and analog headers along the bottom.
ARDUINO_UNO_R3 = {
    "name": "Arduino Uno R3",
    "wokwi_type": "wokwi-arduino-uno",
    "platform": "atmelavr",
    "platformio_board": "uno",
    "kind": "board",
    "logic_voltage": "5v",
    "supply_min_v": 7,
    "supply_max_v": 12,
    "description": "ATmega328P, 5 V logic.",
    "notes_md": notes(
        "SDA and SCL at the top left are the same signals as A4 and A5 (tied). D10–D13 are "
        "SPI (SS, MOSI, MISO, SCK); D0/D1 are the USB serial. PWM on D3, 5, 6, 9, 10, 11.",
        "Power through VIN (7–12 V) or the barrel jack; the 5V pin is the regulator's "
        "output. The pin left of IOREF isn't connected.",
    ),
    "pins": [
        *side(
            "top",
            ("SCL", "i2c_scl", {"tie": "A5", "wokwi_name": "A5.2"}),
            ("SDA", "i2c_sda", {"tie": "A4", "wokwi_name": "A4.2"}),
            ("AREF", "other"),
            ("GND", "ground", {"wokwi_name": "GND.1"}),
            ("D13", "gpio", {"functions": ["spi_sck"]}),
            ("D12", "gpio", {"functions": ["spi_miso"]}),
            ("D11", "gpio", {"functions": ["spi_mosi"]}),
            ("D10", "gpio", {"functions": ["spi_cs"]}),
            ("D9", "gpio"),
            ("D8", "gpio"),
            ("D7", "gpio"),
            ("D6", "gpio"),
            ("D5", "gpio"),
            ("D4", "gpio"),
            ("D3", "gpio"),
            ("D2", "gpio"),
            ("D1", "uart_tx"),
            ("D0", "uart_rx"),
        ),
        *side(
            "bottom",
            ("NC", "nc"),
            ("IOREF", "other", {"voltage": 5}),
            ("RESET", "reset"),
            ("3V3", "power_out", {"voltage": 3.3, "wokwi_name": "3.3V"}),
            ("5V", "power_out", {"voltage": 5}),
            ("GND2", "ground", {"wokwi_name": "GND.2"}),
            ("GND3", "ground", {"wokwi_name": "GND.3"}),
            ("VIN", "power_in", {"voltage": 9}),
            ("A0", "analog", ALSO_GPIO),
            ("A1", "analog", ALSO_GPIO),
            ("A2", "analog", ALSO_GPIO),
            ("A3", "analog", ALSO_GPIO),
            ("A4", "analog", {"functions": ["gpio", "i2c_sda"], "tie": "A4"}),
            ("A5", "analog", {"functions": ["gpio", "i2c_scl"], "tie": "A5"}),
        ),
    ],
}

# Arduino Nano (ATmega328P), top view with the USB socket at the top.
ARDUINO_NANO = {
    "name": "Arduino Nano",
    "wokwi_type": "wokwi-arduino-nano",
    "platform": "atmelavr",
    # Old bootloader, as most clones have; genuine boards since 2018 use nanoatmega328new.
    "platformio_board": "nanoatmega328",
    "kind": "board",
    "logic_voltage": "5v",
    "supply_min_v": 7,
    "supply_max_v": 12,
    "description": "ATmega328P in a breadboard-friendly 30-pin package, 5 V logic.",
    "notes_md": notes(
        "Silkscreen RX0/TX1 are D0/D1. A4/A5 are I2C SDA/SCL. A6 and A7 are analog inputs "
        "only. The two RST pins are joined. 3V3 comes from the USB chip and supplies only a "
        "little current.",
        "Power through VIN (7–12 V), or 5 V into the 5V pin.",
    ),
    "pins": [
        *side(
            "left",
            ("D13", "gpio", {"functions": ["spi_sck"]}),
            ("3V3", "power_out", {"voltage": 3.3, "wokwi_name": "3.3V"}),
            ("AREF", "other"),
            ("A0", "analog", ALSO_GPIO),
            ("A1", "analog", ALSO_GPIO),
            ("A2", "analog", ALSO_GPIO),
            ("A3", "analog", ALSO_GPIO),
            ("A4", "analog", {"functions": ["gpio", "i2c_sda"]}),
            ("A5", "analog", {"functions": ["gpio", "i2c_scl"]}),
            ("A6", "analog", IN_ONLY),
            ("A7", "analog", IN_ONLY),
            ("5V", "power_out", {"voltage": 5}),
            ("RST", "reset", {"tie": "RST", "wokwi_name": "RESET"}),
            ("GND", "ground", {"wokwi_name": "GND.1"}),
            ("VIN", "power_in", {"voltage": 9}),
        ),
        *side(
            "right",
            ("D12", "gpio", {"functions": ["spi_miso"]}),
            ("D11", "gpio", {"functions": ["spi_mosi"]}),
            ("D10", "gpio", {"functions": ["spi_cs"]}),
            ("D9", "gpio"),
            ("D8", "gpio"),
            ("D7", "gpio"),
            ("D6", "gpio"),
            ("D5", "gpio"),
            ("D4", "gpio"),
            ("D3", "gpio"),
            ("D2", "gpio"),
            ("GND2", "ground", {"wokwi_name": "GND.2"}),
            ("RST2", "reset", {"tie": "RST", "wokwi_name": "RESET.2"}),
            ("D0", "uart_rx"),
            ("D1", "uart_tx"),
        ),
    ],
}

# Arduino Pro Micro (ATmega32U4, 5 V / 16 MHz), top view with the USB socket at the top.
ARDUINO_PRO_MICRO = {
    "name": "Arduino Pro Micro (5 V)",
    "platform": "atmelavr",
    "platformio_board": "sparkfun_promicro16",
    "kind": "board",
    "logic_voltage": "5v",
    "supply_min_v": 5,
    "supply_max_v": 12,
    "description": "ATmega32U4 with native USB (SparkFun-style Pro Micro), 5 V logic.",
    "notes_md": notes(
        "Silkscreen shows bare numbers: TX0/RX1 are D1/D0 (Serial1), 2 and 3 are I2C SDA/SCL, "
        "14/15/16 are SPI MISO/SCK/MOSI, A0–A3 are D18–D21. 4, 6, 8, 9 and 10 also read "
        "analog (A6–A10). There's no SS pin broken out: use any pin as chip select.",
        "Serial is the native USB port, so a sketch should wait for it before printing. RAW "
        "takes 5–12 V into the regulator; VCC is the 5 V rail (USB or regulator). The "
        "3.3 V / 8 MHz version looks the same but runs at 3.3 V.",
    ),
    "pins": [
        *side(
            "left",
            ("D1", "uart_tx"),
            ("D0", "uart_rx"),
            ("GND", "ground"),
            ("GND2", "ground"),
            ("D2", "gpio", {"functions": ["i2c_sda"]}),
            ("D3", "gpio", {"functions": ["i2c_scl"]}),
            ("D4", "gpio", {"functions": ["analog"]}),
            ("D5", "gpio"),
            ("D6", "gpio", {"functions": ["analog"]}),
            ("D7", "gpio"),
            ("D8", "gpio", {"functions": ["analog"]}),
            ("D9", "gpio", {"functions": ["analog"]}),
        ),
        *side(
            "right",
            ("RAW", "power_in", {"voltage": 5}),
            ("GND3", "ground"),
            ("RST", "reset"),
            ("VCC", "power_out", {"voltage": 5}),
            ("A3", "analog", ALSO_GPIO),
            ("A2", "analog", ALSO_GPIO),
            ("A1", "analog", ALSO_GPIO),
            ("A0", "analog", ALSO_GPIO),
            ("D15", "gpio", {"functions": ["spi_sck"]}),
            ("D14", "gpio", {"functions": ["spi_miso"]}),
            ("D16", "gpio", {"functions": ["spi_mosi"]}),
            ("D10", "gpio", {"functions": ["analog"]}),
        ),
    ],
}

# Wemos (LOLIN) D1 Mini, top view with the antenna at the top.
WEMOS_D1_MINI = {
    "name": "Wemos D1 Mini",
    "platform": "espressif8266",
    "platformio_board": "d1_mini",
    "kind": "board",
    "logic_voltage": "3v3",
    "description": "ESP8266 (ESP-12F) board with USB, 3.3 V logic.",
    "notes_md": notes(
        "Silkscreen to GPIO: D0 = GPIO16, D1 = GPIO5 (SCL), D2 = GPIO4 (SDA), D3 = GPIO0, "
        "D4 = GPIO2 (blue LED), D5 = GPIO14 (SCK), D6 = GPIO12 (MISO), D7 = GPIO13 (MOSI), "
        "D8 = GPIO15 (SS), TX = GPIO1, RX = GPIO3.",
        "GPIO0 and GPIO2 must be high at boot and GPIO15 low. GPIO16 has no interrupts or "
        "PWM; wire it to RST to wake from deep sleep. A0 reads up to 3.2 V through the "
        "board's divider.",
    ),
    "pins": [
        *side(
            "left",
            ("RST", "reset"),
            ("A0", "analog", {"voltage": 3.2, "flags": ["input_only"]}),
            ("GPIO16", "gpio"),
            ("GPIO14", "gpio", {"functions": ["spi_sck"]}),
            ("GPIO12", "gpio", {"functions": ["spi_miso"]}),
            ("GPIO13", "gpio", {"functions": ["spi_mosi"]}),
            ("GPIO15", "gpio", {"functions": ["spi_cs"], "flags": ["strapping", "boot_low"]}),
            ("3V3", "power_out", {"voltage": 3.3}),
        ),
        *side(
            "right",
            ("GPIO1", "uart_tx"),
            ("GPIO3", "uart_rx"),
            ("GPIO5", "gpio", {"functions": ["i2c_scl"]}),
            ("GPIO4", "gpio", {"functions": ["i2c_sda"]}),
            ("GPIO0", "gpio", {"flags": ["strapping", "boot_high"]}),
            ("GPIO2", "gpio", {"flags": ["strapping", "boot_high"]}),
            ("GND", "ground"),
            ("5V", "power_in", {"voltage": 5}),
        ),
    ],
}

BME280 = {
    "name": "BME280 breakout (4-pin)",
    "libraries": [{"spec": "adafruit/Adafruit BME280 Library@^2.2"}],
    "kind": "sensor",
    "logic_voltage": "3v3",
    "supply_min_v": 1.8,
    "supply_max_v": 3.6,
    "i2c_addresses": [0x76, 0x77],
    "description": "Temperature, humidity and pressure over I2C (the common 4-pin board).",
    "notes_md": notes(
        "This is the 3.3 V-only board without a regulator. Boards with a regulator take "
        "3.3–5 V on VIN: set the supply range to suit yours.",
        "Address 0x76 with SDO low (the default on most boards), 0x77 with SDO high.",
    ),
    "pins": side(
        "left",
        ("VIN", "power_in", {"voltage": 3.3}),
        ("GND", "ground"),
        ("SCL", "i2c_scl"),
        ("SDA", "i2c_sda"),
    ),
}

DHT22 = {
    "name": "DHT22",
    "wokwi_type": "wokwi-dht22",
    "libraries": [{"spec": "adafruit/DHT sensor library@^1.4"}],
    "kind": "sensor",
    "logic_voltage": "both",
    "supply_min_v": 3.3,
    "supply_max_v": 6,
    "description": "Temperature and humidity sensor (AM2302) with a one-wire data line.",
    "notes_md": notes(
        "Pins 1–4 from the left with the grille facing you. DATA needs a 4.7–10 kΩ pull-up "
        "to VCC (modules on a small board usually have it). Read it at most every 2 s.",
    ),
    "pins": side(
        "bottom",
        ("VCC", "power_in", {"voltage": 3.3}),
        ("DATA", "gpio", {"flags": ["open_drain"], "wokwi_name": "SDA"}),
        ("NC", "nc"),
        ("GND", "ground"),
    ),
}

DS18B20 = {
    "name": "DS18B20 (TO-92)",
    "wokwi_type": "wokwi-ds18b20",
    "libraries": [
        {"spec": "paulstoffregen/OneWire@^2.3"},
        {"spec": "milesburton/DallasTemperature@^3.11"},
    ],
    "kind": "sensor",
    "logic_voltage": "both",
    "supply_min_v": 3,
    "supply_max_v": 5.5,
    "description": "1-Wire digital temperature sensor.",
    "notes_md": notes(
        "Pins from the left with the flat face towards you. DQ needs a 4.7 kΩ pull-up to "
        "VDD. Several sensors can share one DQ line.",
    ),
    "pins": side(
        "bottom",
        ("GND", "ground"),
        ("DQ", "gpio", {"flags": ["open_drain"]}),
        ("VDD", "power_in", {"voltage": 3.3, "wokwi_name": "VCC"}),
    ),
}

HC_SR04 = {
    "name": "HC-SR04",
    "wokwi_type": "wokwi-hc-sr04",
    "kind": "sensor",
    "logic_voltage": "5v",
    "supply_min_v": 4.5,
    "supply_max_v": 5.5,
    "description": "Ultrasonic distance sensor, 2–400 cm.",
    "notes_md": notes(
        "Pins from the left with the transducers facing you. ECHO goes up to 5 V: on a "
        "3.3 V board, put a divider (e.g. 1 kΩ and 2 kΩ) between ECHO and the input. TRIG "
        "works from 3.3 V.",
    ),
    "pins": side(
        "bottom",
        ("VCC", "power_in", {"voltage": 5}),
        ("TRIG", "gpio", IN_ONLY),
        ("ECHO", "gpio"),
        ("GND", "ground"),
    ),
}

PIR_HC_SR501 = {
    "name": "PIR HC-SR501",
    "wokwi_type": "wokwi-pir-motion-sensor",
    "kind": "sensor",
    "logic_voltage": "3v3",
    "supply_min_v": 4.5,
    "supply_max_v": 20,
    "description": "Passive infrared motion sensor with adjustable delay and sensitivity.",
    "notes_md": notes(
        "OUT is 3.3 V high on motion, so it suits 3.3 V and 5 V boards. The pin order "
        "differs between makers: read the labels under the dome before wiring.",
    ),
    "pins": side(
        "bottom",
        ("VCC", "power_in", {"voltage": 5}),
        ("OUT", "gpio"),
        ("GND", "ground"),
    ),
}

BH1750 = {
    "name": "BH1750 (GY-302)",
    "libraries": [{"spec": "claws/BH1750@^1.3"}],
    "kind": "sensor",
    "logic_voltage": "both",
    "supply_min_v": 3,
    "supply_max_v": 5,
    "i2c_addresses": [0x23, 0x5C],
    "description": "Ambient light sensor over I2C, 1–65535 lux.",
    "notes_md": notes("Address 0x23 with ADDR low or open, 0x5C with ADDR high."),
    "pins": side(
        "left",
        ("VCC", "power_in", {"voltage": 3.3}),
        ("GND", "ground"),
        ("SCL", "i2c_scl"),
        ("SDA", "i2c_sda"),
        ("ADDR", "other", IN_ONLY),
    ),
}

INA219 = {
    "name": "INA219 breakout",
    "libraries": [{"spec": "adafruit/Adafruit INA219@^1.2"}],
    "kind": "sensor",
    "logic_voltage": "both",
    "supply_min_v": 3,
    "supply_max_v": 5.5,
    "i2c_addresses": [0x40, 0x41, 0x44, 0x45],
    "description": "Current and voltage monitor (0.1 Ω shunt) over I2C, up to 26 V.",
    "notes_md": notes(
        "The load's current runs from VIN+ to VIN−; these pins carry the measured circuit, "
        "up to 26 V, not the sensor's own supply. Address 0x40 by default; the A0/A1 "
        "jumpers give 0x41, 0x44 and 0x45.",
    ),
    "pins": side(
        "left",
        ("VCC", "power_in", {"voltage": 3.3}),
        ("GND", "ground"),
        ("SCL", "i2c_scl"),
        ("SDA", "i2c_sda"),
        ("VIN-", "other", {"voltage": 26}),
        ("VIN+", "other", {"voltage": 26}),
    ),
}

SSD1306 = {
    "name": "SSD1306 128×64 OLED (I2C)",
    "wokwi_type": "board-ssd1306",
    "libraries": [
        {"spec": "adafruit/Adafruit SSD1306@^2.5"},
        {"spec": "adafruit/Adafruit GFX Library@^1.11"},
    ],
    "kind": "display",
    "logic_voltage": "both",
    "supply_min_v": 3.3,
    "supply_max_v": 5,
    "i2c_addresses": [0x3C, 0x3D],
    "description": "0.96″ monochrome OLED, 4-pin I2C version.",
    "notes_md": notes(
        "Pin order varies: many boards are GND, VCC, SCL, SDA, but some swap GND and VCC. "
        "Check the labels. Address 0x3C on most; 0x3D if the address jumper is moved.",
    ),
    "pins": side(
        "top",
        ("GND", "ground"),
        ("VCC", "power_in", {"voltage": 3.3}),
        ("SCL", "i2c_scl"),
        ("SDA", "i2c_sda"),
    ),
}

RELAY_1CH = {
    "name": "Relay module (1-channel, 5 V)",
    "wokwi_type": "wokwi-relay-module",
    "kind": "actuator",
    "logic_voltage": "5v",
    "supply_min_v": 4.5,
    "supply_max_v": 5.5,
    "description": "One 10 A relay with driver transistor and indicator LED.",
    "notes_md": notes(
        "Most boards trigger when IN is pulled low; many work from a 3.3 V output, but not "
        "all. NO, COM and NC are the switched side (mains-rated): never wire them to the "
        "logic circuit.",
    ),
    "pins": [
        *side(
            "left",
            ("VCC", "power_in", {"voltage": 5}),
            ("GND", "ground"),
            ("IN", "gpio", IN_ONLY),
        ),
        *side("right", ("NO", "other"), ("COM", "other"), ("NC", "other")),
    ],
}

SG90 = {
    "name": "SG90 micro servo",
    "wokwi_type": "wokwi-servo",
    # ESP8266 cores include their own Servo library.
    "libraries": [
        {"spec": "arduino-libraries/Servo@^1.2", "platforms": ["atmelavr"]},
        {"spec": "madhephaestus/ESP32Servo@^3.0", "platforms": ["espressif32"]},
    ],
    "kind": "actuator",
    "logic_voltage": "5v",
    "supply_min_v": 4.8,
    "supply_max_v": 6,
    "description": "9 g hobby servo, 180°, 50 Hz PWM.",
    "notes_md": notes(
        "Wires: brown GND, red V+, orange signal. A 3.3 V signal usually works. Power it "
        "from a 5 V supply that can give ~500 mA peaks, not a board's 3.3 V pin.",
    ),
    "pins": side(
        "left",
        ("GND", "ground"),
        ("V+", "power_in", {"voltage": 5}),
        ("PWM", "gpio", IN_ONLY),
    ),
}

LED = {
    "name": "LED (5 mm)",
    "wokwi_type": "wokwi-led",
    "kind": "actuator",
    "logic_voltage": "none",
    "description": "A plain through-hole LED.",
    "notes_md": notes(
        "The anode (A) is the longer leg; the cathode (K) is on the flat side. It needs a "
        "series resistor: about 220 Ω from 3.3 V or 5 V for a red LED at ~10 mA.",
    ),
    "pins": side("bottom", ("A", "other"), ("K", "other", {"wokwi_name": "C"})),
}

PUSH_BUTTON = {
    "name": "Push button (4-leg tactile)",
    "wokwi_type": "wokwi-pushbutton-6mm",
    "kind": "other",
    "logic_voltage": "none",
    "description": "6 mm tactile switch.",
    "notes_md": notes(
        "Legs come in joined pairs (A1/A2 and B1/B2, tied); pressing joins A to B. With a "
        "board's internal pull-up, wire A to the input and B to GND.",
    ),
    "pins": [
        *side(
            "left",
            ("A1", "other", {"tie": "A", "wokwi_name": "1.l"}),
            ("B1", "other", {"tie": "B", "wokwi_name": "2.l"}),
        ),
        *side(
            "right",
            ("A2", "other", {"tie": "A", "wokwi_name": "1.r"}),
            ("B2", "other", {"tie": "B", "wokwi_name": "2.r"}),
        ),
    ],
}

WS2812B = {
    "name": "WS2812B LED strip",
    "wokwi_type": "wokwi-led-strip",
    "libraries": [{"spec": "fastled/FastLED@^3.6"}],
    "kind": "actuator",
    "logic_voltage": "5v",
    "supply_min_v": 4.5,
    "supply_max_v": 5.5,
    "description": "Addressable RGB LED strip (NeoPixel), input end.",
    "notes_md": notes(
        "Wire to the input end (arrows point away from it). Each LED can draw 60 mA at full "
        "white: power the strip directly from a 5 V supply. DIN wants about 3.5 V for a high "
        "at 5 V supply, so a 3.3 V board may need a level shifter; a 330 Ω resistor in "
        "series with DIN helps.",
    ),
    "pins": side(
        "left",
        ("5V", "power_in", {"voltage": 5, "wokwi_name": "VDD"}),
        ("DIN", "gpio", IN_ONLY),
        ("GND", "ground", {"wokwi_name": "VSS"}),
    ),
}

USB_5V = {
    "name": "USB 5 V supply",
    "kind": "power",
    "logic_voltage": "none",
    "description": "5 V from a USB charger or breakout.",
    "notes_md": notes("Check how much current the charger can give."),
    "pins": side("right", ("5V", "power_out", {"voltage": 5}), ("GND", "ground")),
}

AMS1117 = {
    "name": "AMS1117 3.3 V regulator module",
    "kind": "power",
    "logic_voltage": "none",
    "supply_min_v": 4.5,
    "supply_max_v": 12,
    "description": "Linear regulator board, up to about 800 mA.",
    "notes_md": notes(
        "Needs about 1.2 V more in than out, so at least 4.5 V. A linear regulator wastes "
        "the difference as heat: keep the current low from 12 V.",
    ),
    "pins": [
        *side("left", ("VIN", "power_in", {"voltage": 5}), ("GND", "ground")),
        *side("right", ("3V3", "power_out", {"voltage": 3.3})),
    ],
}

HOLDER_18650 = {
    "name": "18650 battery holder",
    "kind": "power",
    "logic_voltage": "none",
    "description": "Single Li-ion 18650 cell holder.",
    "notes_md": notes(
        "3.7 V nominal, 4.2 V when full, about 3.0 V empty. A bare cell has no protection: "
        "use a protected cell or a charger/protection board.",
    ),
    "pins": side("right", ("+", "power_out", {"voltage": 3.7}), ("-", "ground")),
}

# Footprints (build step 14), in mm. Outlines are approximate, from the makers'
# drawings; the Uno (its headers are off the 2.54 mm grid), the HC-SR04, PIR, relay,
# servo, LED strip and power parts have none, since they stay off a protoboard.
OUTLINE = "Footprint: holes and outline in mm from the first pin; the outline is approximate."
STARTER_PARTS: list[dict] = [
    with_footprint(
        ESP32_DEVKIT_V1,
        (-2.72, -10.0, 28.3, 51.6),
        span_mm=22.86,
        note=(
            f"{OUTLINE} The headers are 22.86 mm (0.9 in) apart on most 30-pin boards and "
            "25.4 mm on some: measure yours and fix the right-hand holes if so."
        ),
    ),
    with_footprint(ESP32_C3_SUPERMINI, (-1.38, -3.2, 18.0, 22.5), span_mm=15.24, note=OUTLINE),
    ARDUINO_UNO_R3,
    with_footprint(ARDUINO_NANO, (-1.38, -3.82, 18.0, 43.2), span_mm=15.24, note=OUTLINE),
    with_footprint(ARDUINO_PRO_MICRO, (-1.38, -2.53, 18.0, 33.0), span_mm=15.24, note=OUTLINE),
    with_footprint(WEMOS_D1_MINI, (-1.37, -13.9, 25.6, 34.2), span_mm=22.86, note=OUTLINE),
    with_footprint(BME280, (-1.4, -1.45, 15.0, 10.5), note=OUTLINE),
    with_footprint(
        DHT22,
        (-3.74, -3.85, 15.1, 7.7),
        note=f"{OUTLINE} It stands upright, so the outline is its base.",
    ),
    with_footprint(
        DS18B20,
        (0.14, -1.9, 4.8, 3.8),
        note=(
            f"{OUTLINE} The legs are 1.27 mm apart; the footprint has them spread to "
            "2.54 mm to fit a protoboard."
        ),
    ),
    HC_SR04,
    PIR_HC_SR501,
    with_footprint(BH1750, (-1.3, -1.87, 18.5, 13.9), note=OUTLINE),
    with_footprint(INA219, (-1.3, -6.35, 22.8, 25.4), note=OUTLINE),
    with_footprint(SSD1306, (-9.84, -1.3, 27.3, 27.8), note=OUTLINE),
    RELAY_1CH,
    SG90,
    with_footprint(LED, (-1.63, -2.9, 5.8, 5.8), note=OUTLINE),
    with_footprint(
        PUSH_BUTTON,
        (0.81, -0.46, 6.0, 6.0),
        span_mm=7.62,
        pitch_mm=5.08,
        note=(
            f"{OUTLINE} The legs are 6.5 × 4.5 mm apart; the footprint has them at "
            "7.62 × 5.08 mm (three holes by two), as they're usually bent to fit."
        ),
    ),
    WS2812B,
    USB_5V,
    AMS1117,
    HOLDER_18650,
]


def starter_parts() -> list[PartCreate]:
    return [PartCreate.model_validate(data) for data in STARTER_PARTS]
