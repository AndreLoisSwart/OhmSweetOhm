import type { PinFlag, PinKind } from '@/api/generated/model'
import { PIN_KIND_LABELS } from '@/features/parts/labels'
import { type CardPin, pinColorGroup } from './layout'

/** Everything the card shows about a pin. */
export interface ShownPin extends CardPin {
  functions: readonly PinKind[]
  voltage: number | null
  flags: readonly PinFlag[]
}

export const pinTooltip = (pin: ShownPin) =>
  [
    `${pin.name}: ${PIN_KIND_LABELS[pin.kind]}`,
    pin.functions.length ? `Also ${pin.functions.map((f) => PIN_KIND_LABELS[f]).join(', ')}` : '',
    pin.voltage !== null ? `${pin.voltage} V` : '',
    pin.flags.length ? `Flags: ${pin.flags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

/** The pin's colour, as a CSS variable (docs/pages.md, Visual style). */
export const pinColor = (kind: PinKind) => `var(--pin-${pinColorGroup(kind)})`
