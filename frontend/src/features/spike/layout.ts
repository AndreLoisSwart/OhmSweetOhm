// Pure layout, rotation, net and colour logic for the canvas spike. Kept free of React
// so it can be tested, and so the real canvas (build step 4) can lift it as is.
import type { Part, Pin, PinKind, Side } from './parts'

/** Canvas grid in px. Pin pitch and card sizes are multiples of it, so pins sit on it. */
export const GRID = 10
/** Distance between neighbouring pins: two grid steps, roughly 0.1" headers at 1:1. */
export const PITCH = 20
/** Header with the ref and part name. */
export const HEADER = 40
/** Estimated width of one label character (11px monospace). */
export const CHAR_W = 7

export type Rotation = 0 | 90 | 180 | 270

const CW: Record<Side, Side> = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' }

/**
 * Where a pin ends up after rotating the card clockwise, keeping labels upright.
 * `reversed` means the order along the side flips: turning clockwise, the left side
 * (read top to bottom) becomes the top side read right to left.
 */
export function rotateSide(side: Side, rotation: Rotation): { side: Side; reversed: boolean } {
  let current = side
  let reversed = false
  for (let turn = 0; turn < rotation / 90; turn++) {
    // left→top and right→bottom flip the reading direction; top→right and bottom→left keep it.
    if (current === 'left' || current === 'right') reversed = !reversed
    current = CW[current]
  }
  return { side: current, reversed }
}

export interface PinSlot {
  pin: Pin
  side: Side
  /** Handle centre relative to the card's top-left corner, in px. */
  x: number
  y: number
}

export interface CardLayout {
  width: number
  height: number
  /** Top of the header block (below any top-side labels). */
  headerTop: number
  slots: PinSlot[]
}

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step
const labelLength = (pins: Pin[]) => Math.max(0, ...pins.map((p) => p.name.length)) * CHAR_W

/** Card size and handle positions for a part at a rotation. All edges land on the grid. */
export function layoutCard(part: Part, rotation: Rotation): CardLayout {
  const bySide: Record<Side, { pin: Pin; order: number }[]> = {
    left: [],
    right: [],
    top: [],
    bottom: [],
  }
  for (const pin of part.pins) {
    const { side, reversed } = rotateSide(pin.side, rotation)
    bySide[side].push({ pin, order: reversed ? -pin.position : pin.position })
  }
  for (const list of Object.values(bySide)) list.sort((a, b) => a.order - b.order)
  const pins = (side: Side) => bySide[side].map((s) => s.pin)

  const band = (side: Side) =>
    bySide[side].length ? roundUp(labelLength(pins(side)) + 14, GRID) : 0
  const topBand = band('top')
  const bottomBand = band('bottom')
  const leftCol = band('left')
  const rightCol = band('right')
  const rows = Math.max(bySide.left.length, bySide.right.length)
  const cols = Math.max(bySide.top.length, bySide.bottom.length)
  const headerWidth = (Math.max(part.name.length, 8) + 2) * CHAR_W

  const width = roundUp(
    Math.max(leftCol + rightCol + 20, cols * PITCH + 2 * GRID, headerWidth),
    PITCH,
  )
  const rowsTop = topBand + HEADER
  const height = roundUp(rowsTop + rows * PITCH + (rows ? GRID : 0) + bottomBand, PITCH)
  const colsLeft = roundUp((width - cols * PITCH) / 2, GRID)

  const slots: PinSlot[] = []
  for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
    bySide[side].forEach(({ pin }, i) => {
      const along = i * PITCH + PITCH / 2
      if (side === 'left') slots.push({ pin, side, x: 0, y: rowsTop + along })
      if (side === 'right') slots.push({ pin, side, x: width, y: rowsTop + along })
      if (side === 'top') slots.push({ pin, side, x: colsLeft + along, y: 0 })
      if (side === 'bottom') slots.push({ pin, side, x: colsLeft + along, y: height })
    })
  }
  return { width, height, headerTop: topBand, slots }
}

/** A pin on the canvas: `ref.PIN`, as wires and MCP tools name them. */
export const pinKey = (ref: string, pin: string) => `${ref}.${pin}`

/**
 * Nets from wires by union-find. Returns each wired pin's net members. Computed on
 * the fly, never stored (docs/data-model.md).
 */
export function computeNets(wires: { a: string; b: string }[]): Map<string, string[]> {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    // Path compression.
    while (parent.get(x) !== root) {
      const next = parent.get(x)!
      parent.set(x, root)
      x = next
    }
    return root
  }
  for (const { a, b } of wires) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const groups = new Map<string, string[]>()
  for (const key of parent.keys()) {
    const root = find(key)
    groups.set(root, [...(groups.get(root) ?? []), key])
  }
  const nets = new Map<string, string[]>()
  for (const members of groups.values()) {
    members.sort()
    for (const m of members) nets.set(m, members)
  }
  return nets
}

export type WireColor =
  'red' | 'black' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | 'white' | 'brown'

export const WIRE_COLORS: WireColor[] = [
  'red',
  'black',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'gray',
  'white',
  'brown',
]

const ROTATION: WireColor[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'white', 'brown']
const isPower = (k: PinKind) => k === 'power_out' || k === 'power_in'

/** Default wire colour: red for power, black for ground, else the next in a rotation. */
export function defaultWireColor(a: PinKind, b: PinKind, wireCount: number): WireColor {
  if (isPower(a) || isPower(b)) return 'red'
  if (a === 'ground' || b === 'ground') return 'black'
  return ROTATION[wireCount % ROTATION.length]
}

/** The colour group a pin kind is drawn in (docs/pages.md, Visual style). */
export function pinColorGroup(kind: PinKind): string {
  if (isPower(kind)) return 'power'
  if (kind === 'ground') return 'ground'
  if (kind.startsWith('i2c')) return 'i2c'
  if (kind.startsWith('spi')) return 'spi'
  if (kind.startsWith('uart')) return 'uart'
  if (kind === 'analog') return 'analog'
  return 'gpio'
}
