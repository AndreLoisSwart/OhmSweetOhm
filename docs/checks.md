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
| `overvoltage` | error | A net carrying a higher voltage reaches a signal or `power_in` pin rated lower. The net's voltage comes from its `power_out` pins, or from the logic level of the parts driving it. Not raised for `five_v_tolerant` pins |
| `undervoltage_supply` | warning | A `power_in` pin is fed less than its part's `supply_min_v` |
| `no_ground` | error | A part with power wired has no `ground` pin connected to any other part's ground |
| `unpowered` | warning | A part with `power_in` pins has none of them connected |
| `output_to_output` | warning | Two `uart_tx` pins, or two pins of the same push-pull kind, are joined |
| `uart_crossed` | warning | `uart_tx` is wired to `uart_tx` (or `rx` to `rx`) instead of crossed |
| `i2c_mismatch` | error | An SDA pin is wired to an SCL pin |
| `i2c_address_clash` | error | Two parts on the same SDA net use the same default I2C address |
| `i2c_pullups` | note | An I2C bus has no part known to carry pull-ups (shown as a reminder; most breakouts include them) |
| `flash_pin` | error | A wire is attached to a pin flagged `flash` |
| `input_only_driven` | warning | A pin flagged `input_only` is on a net where it would need to drive (e.g. wired to an `spi_cs` or an actuator's input) |
| `strapping_pin` | warning | A pin flagged `strapping` (or `boot_high`/`boot_low`) is used; it can stop the board booting depending on what's attached |
| `adc2_wifi` | warning | An `analog` use of a pin flagged `adc2` on a board with WiFi |
| `nc_connected` | warning | A pin of kind `nc` has a wire |
| `unverified_part` | warning | A placed part is not verified, so its pinout may be wrong |
| `floating_input` | note | A `enable` or `reset` pin has no wire |

## Output shape

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
