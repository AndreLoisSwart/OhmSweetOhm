import type { PinFlag, PinKind } from '@/api/generated/model'
import { PIN_KIND_LABELS } from '@/features/parts/labels'
import { type CardPin, pinColorGroup } from './layout'

/** Everything the card shows about a pin. */
export interface ShownPin extends CardPin {
  functions: readonly PinKind[]
  voltage: number | null
  flags: readonly PinFlag[]
}

/** Power pins are drawn by direction: a supply's output, or a load's input. */
export type PowerRole = 'source' | 'load'

export const powerRole = (kind: PinKind): PowerRole | null =>
  kind === 'power_out' ? 'source' : kind === 'power_in' ? 'load' : null

const powerLine = (pin: ShownPin) => {
  const v = pin.voltage !== null ? ` ${pin.voltage} V` : ''
  if (pin.kind === 'power_out') return `Supplies power${v}`
  if (pin.kind === 'power_in') return `Takes power${v}`
  return pin.voltage !== null ? `${pin.voltage} V` : ''
}

export const pinTooltip = (pin: ShownPin) =>
  [
    `${pin.name}: ${PIN_KIND_LABELS[pin.kind]}`,
    powerLine(pin),
    pin.functions.length ? `Also ${pin.functions.map((f) => PIN_KIND_LABELS[f]).join(', ')}` : '',
    pin.flags.length ? `Flags: ${pin.flags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

/** The pin's colour, as a CSS variable (docs/pages.md, Visual style). */
export const pinColor = (kind: PinKind) => `var(--pin-${pinColorGroup(kind)})`
