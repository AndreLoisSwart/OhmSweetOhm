"""Library hints and the PlatformIO project file (build step 12)."""

import pytest


@pytest.fixture
def library(api):
    assert api.post("/api/parts/starter").status_code == 200
    return {p["name"]: p for p in api.get("/api/parts").json()}


def place(api, library, parts: dict[str, str]) -> int:
    design = api.post("/api/designs", json={"name": "Bench"}).json()
    placed = [{"part_id": library[name]["id"], "ref": ref} for ref, name in parts.items()]
    api.post(f"/api/designs/{design['id']}/placements", json={"parts": placed})
    return design["id"]


def project(api, design_id: int, **params) -> str:
    res = api.get(f"/api/designs/{design_id}/platformio", params=params)
    assert res.status_code == 200, res.text
    out = res.json()
    assert [f["filename"] for f in out["files"]] == ["platformio.ini"]
    return out["files"][0]["text"]


def test_part_fields_round_trip_and_validate(api):
    part = api.post(
        "/api/parts",
        json={
            "name": "Servo",
            "kind": "actuator",
            "libraries": [
                {"spec": " arduino-libraries/Servo@^1.2 ", "platforms": ["atmelavr"]},
                {"spec": "madhephaestus/ESP32Servo@^3.0", "platforms": ["espressif32"]},
                # A repeat (ignoring case) is dropped.
                {"spec": "Arduino-Libraries/Servo@^1.2"},
            ],
        },
    ).json()
    assert part["libraries"] == [
        {"spec": "arduino-libraries/Servo@^1.2", "platforms": ["atmelavr"]},
        {"spec": "madhephaestus/ESP32Servo@^3.0", "platforms": ["espressif32"]},
    ]
    assert part["platform"] is None and part["platformio_board"] is None
    board = api.patch(
        f"/api/parts/{part['id']}",
        json={"platform": "atmelavr", "platformio_board": " uno ", "libraries": []},
    ).json()
    assert (board["platform"], board["platformio_board"], board["libraries"]) == (
        "atmelavr",
        "uno",
        [],
    )
    cleared = api.patch(f"/api/parts/{part['id']}", json={"platformio_board": " "}).json()
    assert cleared["platformio_board"] is None
    for bad in (
        {"platform": "stm32"},
        {"platformio_board": "esp 32"},
        {"libraries": [{"spec": "a, b"}]},
        {"libraries": None},
    ):
        assert api.patch(f"/api/parts/{part['id']}", json=bad).status_code == 422, bad
    api.patch(
        f"/api/parts/{part['id']}",
        json={
            "platformio_board": "uno",
            "libraries": [{"spec": "x/Y@1", "platforms": ["atmelavr"]}],
        },
    )
    copy = api.post(f"/api/parts/{part['id']}/copy").json()
    assert (copy["platform"], copy["platformio_board"]) == ("atmelavr", "uno")
    assert copy["libraries"] == [{"spec": "x/Y@1", "platforms": ["atmelavr"]}]


def test_esp32_weather_station(api, library):
    design_id = place(
        api,
        library,
        {
            "esp": "ESP32 DevKit V1 (30-pin)",
            "bme": "BME280 breakout (4-pin)",
            "oled": "SSD1306 128×64 OLED (I2C)",
            "oled2": "SSD1306 128×64 OLED (I2C)",
            "servo": "SG90 micro servo",
            "led": "LED (5 mm)",
        },
    )
    text = project(api, design_id)
    assert "[env:esp]\nplatform = espressif32\nboard = esp32dev\nframework = arduino" in text
    assert "monitor_speed = 115200" in text
    deps = text.split("lib_deps =\n", 1)[1].split("\n\n", 1)[0].splitlines()
    assert deps == [
        "    adafruit/Adafruit BME280 Library@^2.2",
        "    adafruit/Adafruit SSD1306@^2.5",
        "    adafruit/Adafruit GFX Library@^1.11",
        "    madhephaestus/ESP32Servo@^3.0",
    ]
    assert ";   adafruit/Adafruit SSD1306@^2.5: oled, oled2" in text
    assert "Adafruit BME280 Library, Adafruit SSD1306, Adafruit GFX Library, ESP32Servo" in text
    assert ";   arduino-libraries/Servo@^1.2: servo" in text.split("Not used on espressif32")[1]
    # A board with a USB-serial chip gets no native-USB hint.
    assert "ARDUINO_USB_CDC_ON_BOOT" not in text


def test_uno_takes_the_avr_servo_library(api, library):
    text = project(api, place(api, library, {"uno": "Arduino Uno R3", "servo": "SG90 micro servo"}))
    assert "platform = atmelavr\nboard = uno" in text
    assert "lib_deps =\n    arduino-libraries/Servo@^1.2\n" in text
    assert "ESP32Servo@^3.0: servo" in text.split("Not used on atmelavr")[1]


def test_c3_gets_the_native_usb_hint(api, library):
    text = project(api, place(api, library, {"c3": "ESP32-C3 SuperMini"}))
    assert "board = esp32-c3-devkitm-1" in text
    assert "; build_flags = -D ARDUINO_USB_CDC_ON_BOOT=1" in text
    assert "lib_deps" not in text


def test_board_without_platform_data(api, library):
    board = api.post("/api/parts", json={"name": "Mystery", "kind": "board"}).json()
    library["Mystery"] = board
    text = project(api, place(api, library, {"m": "Mystery", "servo": "SG90 micro servo"}))
    assert "Mystery has no platform or PlatformIO board yet" in text
    assert "platform =\nboard =\n" in text
    # Platform-specific libraries can't be chosen yet.
    assert "lib_deps" not in text
    assert "until the board's platform is set" in text


def test_other_boards_libraries_are_left_out(api, library):
    design_id = place(api, library, {"esp": "ESP32 DevKit V1 (30-pin)", "uno": "Arduino Uno R3"})
    res = api.get(f"/api/designs/{design_id}/platformio")
    assert res.status_code == 409
    text = project(api, design_id, board="uno")
    assert "[env:uno]" in text and "esp32dev" not in text


def test_starter_fills_empty_firmware_fields_only(api):
    # Parts already in the library, as an earlier version added them.
    api.post("/api/parts", json={"name": "Arduino Uno R3", "kind": "board"})
    api.post(
        "/api/parts",
        json={
            "name": "DHT22",
            "kind": "sensor",
            "libraries": [{"spec": "my/DHT@1.0"}],
            "wokwi_type": "my-dht",
        },
    )
    out = api.post("/api/parts/starter").json()
    assert "Arduino Uno R3" in out["updated"]
    assert "DHT22" not in out["updated"] and "DHT22" in out["skipped"]
    parts = {p["name"]: p for p in api.get("/api/parts").json()}
    uno = api.get(f"/api/parts/{parts['Arduino Uno R3']['id']}").json()
    assert (uno["platform"], uno["platformio_board"]) == ("atmelavr", "uno")
    assert uno["verified"] is True  # filling empty fields doesn't unverify the user's part
    dht = api.get(f"/api/parts/{parts['DHT22']['id']}").json()
    assert dht["libraries"] == [{"spec": "my/DHT@1.0", "platforms": []}]
    again = api.post("/api/parts/starter").json()
    assert again["updated"] == [] and again["added"] == []
