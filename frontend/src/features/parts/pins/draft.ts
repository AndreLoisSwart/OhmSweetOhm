// The pin editor's working copy: plain data, so the rules can be tested without React.
import type { PinFlag, PinIn, PinKind, PinOut, PinSide } from '@/api/generated/model'
import { PIN_SIDES } from '@/features/parts/labels'

export interface DraftPin {
  /** Stable React key; new pins have no id until saved. */
  key: string
  id?: number
  name: string
  kind: PinKind
  functions: PinKind[]
  voltage: number | null
  flags: PinFlag[]
  side: PinSide
  /** Order within its side; kept current by withPositions. */
  position: number
  wokwi_name: string | null
}

let counter = 0
const newKey = () => `new-${++counter}`

/** Pins grouped by side (left, right, top, bottom), each in header order. */
export function sortBySide<P extends { side: PinSide; position: number }>(pins: P[]): P[] {
  return [...pins].sort(
    (a, b) => PIN_SIDES.indexOf(a.side) - PIN_SIDES.indexOf(b.side) || a.position - b.position,
  )
}

/** Renumbers positions per side from the list order, and groups the list by side. */
export function withPositions(pins: DraftPin[]): DraftPin[] {
  const next: Partial<Record<PinSide, number>> = {}
  const ordered = [...pins].sort((a, b) => PIN_SIDES.indexOf(a.side) - PIN_SIDES.indexOf(b.side))
  return ordered.map((p) => {
    const position = next[p.side] ?? 0
    next[p.side] = position + 1
    return p.position === position ? p : { ...p, position }
  })
}

export function fromPins(pins: PinOut[]): DraftPin[] {
  return sortBySide(pins).map((p) => ({
    key: `pin-${p.id}`,
    id: p.id,
    name: p.name,
    kind: p.kind,
    functions: [...p.functions],
    voltage: p.voltage,
    flags: [...p.flags],
    side: p.side,
    position: p.position,
    wokwi_name: p.wokwi_name,
  }))
}

/** What the API takes: the whole list, each side in order. */
export function toPinsIn(pins: DraftPin[]): PinIn[] {
  return sortBySide(pins).map(
    ({ id, name, kind, functions, voltage, flags, side, wokwi_name }) => ({
      ...(id !== undefined && { id }),
      name: name.trim(),
      kind,
      functions,
      voltage,
      flags,
      side,
      wokwi_name: wokwi_name?.trim() || null,
    }),
  )
}

const REPEAT = 'Name used twice: number repeats, e.g. GND2'

/** Problems that would make the server refuse the list, by pin key. */
export function pinErrors(pins: DraftPin[]): Map<string, string> {
  const errors = new Map<string, string>()
  const seen = new Map<string, string>()
  for (const pin of pins) {
    const name = pin.name.trim()
    const lower = name.toLowerCase()
    if (!name) errors.set(pin.key, 'Needs a name')
    else if (/[\s.]/.test(name)) errors.set(pin.key, 'No spaces or dots')
    else if (name.length > 40) errors.set(pin.key, 'At most 40 characters')
    else if (seen.has(lower)) {
      errors.set(pin.key, REPEAT)
      errors.set(seen.get(lower)!, REPEAT)
    } else seen.set(lower, pin.key)
    if (pin.voltage !== null && !(pin.voltage > 0 && pin.voltage <= 60) && !errors.has(pin.key))
      errors.set(pin.key, 'Voltage must be above 0 and at most 60')
  }
  return errors
}

const RULES: [RegExp, PinKind][] = [
  [/^(GND|VSS|AGND|DGND)\d*$/, 'ground'],
  [/^(3V3|3\.3V|5V|VCC|VDD|VIN|V\+|VBAT|VBUS)\d*$/, 'power_in'],
  [/^SDA\d*$/, 'i2c_sda'],
  [/^SCL\d*$/, 'i2c_scl'],
  [/^(MOSI|SDI|DIN|COPI)\d*$/, 'spi_mosi'],
  [/^(MISO|SDO|DOUT|CIPO)\d*$/, 'spi_miso'],
  [/^(SCK|SCLK|CLK)\d*$/, 'spi_sck'],
  [/^(CS|SS|CE|NSS)\d*$/, 'spi_cs'],
  [/^(TX|TXD)\d*$/, 'uart_tx'],
  [/^(RX|RXD)\d*$/, 'uart_rx'],
  [/^(EN|CHIP_EN|ENABLE)$/, 'enable'],
  [/^(RST|RESET|NRST)$/, 'reset'],
  [/^NC\d*$/, 'nc'],
  [/^(A|ADC)\d+$/, 'analog'],
]

/** A first guess at a pin's kind from its name, for pins added in bulk. GPIO otherwise. */
export function guessKind(name: string): PinKind {
  const upper = name.trim().toUpperCase()
  return RULES.find(([pattern]) => pattern.test(upper))?.[1] ?? 'gpio'
}

/** Names from pasted text: one per line, or separated by commas or tabs. */
export function parseNames(text: string): string[] {
  return text
    .split(/[\n,\t]+/)
    .map((s) => s.trim().replace(/\s+/g, '_'))
    .filter(Boolean)
}

export function newPin(name: string, side: PinSide): DraftPin {
  return {
    key: newKey(),
    name,
    kind: guessKind(name),
    functions: [],
    voltage: null,
    flags: [],
    side,
    position: 0,
    wokwi_name: null,
  }
}
