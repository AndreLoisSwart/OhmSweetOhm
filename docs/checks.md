# Design checks

Checks run on the server against a design's computed nets (`backend/app/modules/checks/`). They are rules, not opinions: each one either fires or doesn't, and says which pins and nets it's about. Claude gets the same results through `check_design` and reviews the higher-level questions on top (pull-up values, power budget, better pin choices).

Checks are computed every time and never stored.

## Severities

| Severity | Meaning |
|---|---|
| `error` | Likely to damage something or certainly won't work |
| `warning` | Probably wrong, or works only in some conditions |
| `note` | Worth knowing; often fine |

## Phase 1 rules

| Id | Severity | Fires when |
|---|---|---|
| `power_short` | error | A net contains both a `power_out` pin and a `ground` pin |
| `supply_clash` | error | A net joins two `power_out` pins of different voltages (5 V and 3.3 V outputs tied together) |
| `overvoltage` | error | A net carrying a higher voltage reaches a signal or `power_in` pin rated lower. The net's voltage comes from its `power_out` pins, or else from the logic level of the parts on it with a fixed level (`3v3` or `5v`; `both` adapts and drives nothing). A signal pin is rated at its own `voltage`, else its part's logic level (`both` counts as 5 V); a `power_in` pin at its part's `supply_max_v`, else its own `voltage`. Not raised for `five_v_tolerant` pins up to 5 V |
| `undervoltage_supply` | warning | A `power_in` pin is fed less than its part's `supply_min_v` |
| `no_ground` | error | A part with power wired has no `ground` pin connected to any other part's ground |
| `unpowered` | warning | A part with `power_in` pins has none of them connected. Not raised for boards (usually powered over USB) or power parts (they are the supply) |
| `output_to_output` | warning | Two `power_out` pins of the same voltage, on different parts, are joined, so the supplies fight or back-feed (different voltages are `supply_clash`; TX to TX is `uart_crossed`) |
| `uart_crossed` | warning | `uart_tx` is wired to `uart_tx` (or `rx` to `rx`) instead of crossed |
| `i2c_mismatch` | error | An SDA pin is wired to an SCL pin. A pin counts by its kind or its `functions` (ESP32 GPIO21 is SDA by function), as long as one side is so by kind |
| `i2c_address_clash` | error | Two parts on the same SDA net use the same default I2C address (the first in `i2c_addresses`) |
| `i2c_pullups` | note | A reminder on every I2C bus (a net with an SDA pin), since parts don't yet record whether they carry pull-ups; most breakouts do |
| `flash_pin` | error | A wire is attached to a pin flagged `flash` |
| `input_only_driven` | warning | A pin flagged `input_only` is on a net with another part's pin that needs driving: SPI CS, MOSI or SCK, UART RX, I2C, `enable`, `reset`, or any signal pin of an actuator |
| `strapping_pin` | warning | A pin flagged `strapping` (or `boot_high`/`boot_low`) is used; it can stop the board booting depending on what's attached |
| `adc2_wifi` | warning | A pin flagged `adc2` is wired to another part's `analog` pin. Only ESP32-class boards carry the flag, and they all have WiFi |
| `nc_connected` | warning | A pin of kind `nc` has a wire |
| `unverified_part` | warning | A placed part is not verified, so its pinout may be wrong |
| `floating_input` | note | A `enable` or `reset` pin has no wire |

## Output shape

`GET /api/designs/{id}/checks` returns this. Every design answer (`GET /api/designs/{id}` and every change) carries it as `checks`, so the checks bar is current after each change, and the designs list carries each design's `check_summary`. Results come errors first. Voltages compare with a 0.25 V tolerance.


```json
{
  "design_id": 3,
  "summary": {"error": 1, "warning": 2, "note": 1},
  "results": [
    {
      "id": "overvoltage",
      "severity": "error",
      "message": "bme.SDA (3.3 V max) is on a 5 V net driven by uno.A4",
      "pins": ["bme.SDA", "uno.A4"],
      "net": "uno.A4"
    }
  ]
}
```

## Adding a rule

One function per rule in `checks/rules.py`, taking the design's computed nets and returning results. Each rule gets a test with a small design that fires it and one that doesn't.
