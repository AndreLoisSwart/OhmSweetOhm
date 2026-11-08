import type {
  LogicVoltage,
  PartKind,
  PinFlag,
  PinKind,
  PinSide,
  Platform,
} from '@/api/generated/model'

export const PART_KINDS: PartKind[] = [
  'board',
  'sensor',
  'display',
  'actuator',
  'module',
  'power',
  'passive',
  'other',
]

export const PART_KIND_LABELS: Record<PartKind, string> = {
  board: 'Board',
  sensor: 'Sensor',
  display: 'Display',
  actuator: 'Actuator',
  module: 'Module',
  power: 'Power',
  passive: 'Passive',
  other: 'Other',
}

export const LOGIC_VOLTAGES: LogicVoltage[] = ['3v3', '5v', 'both', 'none']

export const LOGIC_VOLTAGE_LABELS: Record<LogicVoltage, string> = {
  '3v3': '3.3 V',
  '5v': '5 V',
  both: '3.3 or 5 V',
  none: 'No logic',
}

export const PLATFORMS: Platform[] = ['espressif32', 'espressif8266', 'atmelavr']
export const PLATFORM_LABELS: Record<Platform, string> = {
  espressif32: 'ESP32',
  espressif8266: 'ESP8266',
  atmelavr: 'AVR',
}

export const PIN_KINDS: PinKind[] = [
  'power_out',
  'power_in',
  'ground',
  'gpio',
  'analog',
  'i2c_sda',
  'i2c_scl',
  'spi_mosi',
  'spi_miso',
  'spi_sck',
  'spi_cs',
  'uart_tx',
  'uart_rx',
  'enable',
  'reset',
  'nc',
  'other',
]

export const PIN_KIND_LABELS: Record<PinKind, string> = {
  power_out: 'Power out',
  power_in: 'Power in',
  ground: 'Ground',
  gpio: 'GPIO',
  analog: 'Analog',
  i2c_sda: 'I2C SDA',
  i2c_scl: 'I2C SCL',
  spi_mosi: 'SPI MOSI',
  spi_miso: 'SPI MISO',
  spi_sck: 'SPI SCK',
  spi_cs: 'SPI CS',
  uart_tx: 'UART TX',
  uart_rx: 'UART RX',
  enable: 'Enable',
  reset: 'Reset',
  nc: 'Not connected',
  other: 'Other',
}

export const PIN_FLAGS: PinFlag[] = [
  'input_only',
  'strapping',
  'flash',
  'adc2',
  'five_v_tolerant',
  'open_drain',
  'boot_high',
  'boot_low',
]

export const PIN_FLAG_LABELS: Record<PinFlag, string> = {
  input_only: 'Input only',
  strapping: 'Strapping',
  flash: 'Flash (don’t use)',
  adc2: 'ADC2 (no analog with WiFi)',
  five_v_tolerant: '5 V tolerant',
  open_drain: 'Open drain',
  boot_high: 'High at boot',
  boot_low: 'Low at boot',
}

/** Short forms, for summaries in tight spaces. */
export const PIN_FLAG_SHORT: Record<PinFlag, string> = {
  input_only: 'Input only',
  strapping: 'Strapping',
  flash: 'Flash',
  adc2: 'ADC2',
  five_v_tolerant: '5 V tolerant',
  open_drain: 'Open drain',
  boot_high: 'High at boot',
  boot_low: 'Low at boot',
}

/** Flags worth a mark on the card; the rest show in the pin's tooltip. */
export const FLAG_MARKS: Partial<Record<PinFlag, string>> = {
  input_only: 'I',
  strapping: 'S',
  flash: 'F',
}

export const PIN_SIDES: PinSide[] = ['left', 'right', 'top', 'bottom']

export const PIN_SIDE_LABELS: Record<PinSide, string> = {
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
}
