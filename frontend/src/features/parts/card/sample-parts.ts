// Two hand-entered parts shaped like the API's pins: test fixtures for the card layout,
// and the canvas spike's parts. The ESP32 data can seed the starter part (build step 8).

export type PinKind =
  | 'power_out'
  | 'power_in'
  | 'ground'
  | 'gpio'
  | 'analog'
  | 'i2c_sda'
  | 'i2c_scl'
  | 'spi_mosi'
  | 'spi_miso'
  | 'spi_sck'
  | 'spi_cs'
  | 'uart_tx'
  | 'uart_rx'
  | 'enable'
  | 'reset'
  | 'nc'
  | 'other'

export type PinFlag =
  | 'input_only'
  | 'strapping'
  | 'flash'
  | 'adc2'
  | 'five_v_tolerant'
  | 'open_drain'
  | 'boot_high'
  | 'boot_low'

export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface Pin {
  name: string
  kind: PinKind
  functions: PinKind[]
  voltage: number | null
  flags: PinFlag[]
  side: Side
  /** Order along the side: top to bottom on left/right, left to right on top/bottom. */
  position: number
}

export interface Part {
  name: string
  pins: Pin[]
}

const pin = (
  side: Side,
  position: number,
  name: string,
  kind: PinKind,
  extra: { functions?: PinKind[]; flags?: PinFlag[]; voltage?: number } = {},
): Pin => ({
  name,
  kind,
  side,
  position,
  functions: extra.functions ?? [],
  flags: extra.flags ?? [],
  voltage: extra.voltage ?? null,
})

// ESP32 DevKit V1 (DOIT, 30 pins), top view with the antenna at the top. The 30-pin
// board doesn't break out the flash pins (GPIO6–11), so no pin here has `flash`.
const left: [string, PinKind, Parameters<typeof pin>[4]?][] = [
  ['EN', 'enable'],
  ['GPIO36', 'analog', { flags: ['input_only'] }],
  ['GPIO39', 'analog', { flags: ['input_only'] }],
  ['GPIO34', 'analog', { flags: ['input_only'] }],
  ['GPIO35', 'analog', { flags: ['input_only'] }],
  ['GPIO32', 'gpio', { functions: ['analog'] }],
  ['GPIO33', 'gpio', { functions: ['analog'] }],
  ['GPIO25', 'gpio', { functions: ['analog'], flags: ['adc2'] }],
  ['GPIO26', 'gpio', { functions: ['analog'], flags: ['adc2'] }],
  ['GPIO27', 'gpio', { functions: ['analog'], flags: ['adc2'] }],
  ['GPIO14', 'gpio', { functions: ['analog', 'spi_sck'], flags: ['adc2'] }],
  ['GPIO12', 'gpio', { functions: ['analog', 'spi_miso'], flags: ['adc2', 'strapping'] }],
  ['GPIO13', 'gpio', { functions: ['analog', 'spi_mosi'], flags: ['adc2'] }],
  ['GND', 'ground'],
  ['VIN', 'power_in', { voltage: 5 }],
]
const right: [string, PinKind, Parameters<typeof pin>[4]?][] = [
  ['GPIO23', 'gpio', { functions: ['spi_mosi'] }],
  ['GPIO22', 'gpio', { functions: ['i2c_scl'] }],
  ['GPIO1', 'uart_tx'],
  ['GPIO3', 'uart_rx'],
  ['GPIO21', 'gpio', { functions: ['i2c_sda'] }],
  ['GPIO19', 'gpio', { functions: ['spi_miso'] }],
  ['GPIO18', 'gpio', { functions: ['spi_sck'] }],
  ['GPIO5', 'gpio', { functions: ['spi_cs'], flags: ['strapping'] }],
  ['GPIO17', 'gpio', { functions: ['uart_tx'] }],
  ['GPIO16', 'gpio', { functions: ['uart_rx'] }],
  ['GPIO4', 'gpio', { functions: ['analog'], flags: ['adc2'] }],
  ['GPIO2', 'gpio', { functions: ['analog'], flags: ['adc2', 'strapping'] }],
  ['GPIO15', 'gpio', { functions: ['analog', 'spi_cs'], flags: ['adc2', 'strapping'] }],
  ['GND', 'ground'],
  ['3V3', 'power_out', { voltage: 3.3 }],
]

// Two pins are both called GND; names must be unique within a part, so the right one
// becomes GND2 (a finding for the pin editor: duplicate silkscreen names are common).
export const ESP32_DEVKIT_V1: Part = {
  name: 'ESP32 DevKit V1 (30-pin)',
  pins: [
    ...left.map(([name, kind, extra], i) => pin('left', i, name, kind, extra)),
    ...right.map(([name, kind, extra], i) =>
      pin('right', i, name === 'GND' ? 'GND2' : name, kind, extra),
    ),
  ],
}

export const BME280: Part = {
  name: 'BME280 breakout',
  pins: [
    pin('left', 0, 'VIN', 'power_in', { voltage: 3.3 }),
    pin('left', 1, 'GND', 'ground'),
    pin('left', 2, 'SCL', 'i2c_scl'),
    pin('left', 3, 'SDA', 'i2c_sda'),
  ],
}
