// The board's drawing geometry (build step 16): where each hole sits on screen, in both
// views, and the colours nets are tinted with. Pure, so it can be tested without React.
import type { LayoutDetail, LayoutPartOut, LayoutSnapshot, PinOut } from '@/api/generated/model'

/** Screen px between neighbouring holes. */
export const STEP = 24
/** Room for the strip letters and hole numbers. */
export const MARGIN = 30
export const PITCH_MM = 2.54

export interface BoardView {
  strips: number
  holes: number
  /** The bottom (copper) side: mirrored left to right, as when the board is turned over. */
  flipped: boolean
}

export interface Cell {
  strip: number
  hole: number
}

export function stripLabel(strip: number): string {
  let text = ''
  for (let n = strip; n > 0; n = Math.floor((n - 1) / 26)) {
    text = String.fromCharCode(65 + ((n - 1) % 26)) + text
  }
  return text
}

export const cellLabel = ({ strip, hole }: Cell) => `${stripLabel(strip)}${hole}`

/** The centre of a hole (fractional holes and strips work too, for outlines). */
export function holeX(hole: number, view: BoardView): number {
  const column = view.flipped ? view.holes - hole : hole - 1
  return MARGIN + column * STEP + STEP / 2
}

export function stripY(strip: number): number {
  return MARGIN + (strip - 1) * STEP + STEP / 2
}

export function boardSize(view: BoardView) {
  return {
    width: MARGIN + view.holes * STEP + STEP / 2,
    height: MARGIN + view.strips * STEP + STEP / 2,
  }
}

/** The hole nearest a point on the drawing (not limited to the board). */
export function cellAt(x: number, y: number, view: BoardView): Cell {
  const column = Math.round((x - MARGIN - STEP / 2) / STEP)
  return {
    strip: Math.round((y - MARGIN - STEP / 2) / STEP) + 1,
    hole: view.flipped ? view.holes - column : column + 1,
  }
}

/** A box between fractional holes and strips, on screen. */
export function boxRect(
  box: { strip0: number; hole0: number; strip1: number; hole1: number },
  view: BoardView,
) {
  const xs = [holeX(box.hole0, view), holeX(box.hole1, view)]
  return {
    x: Math.min(...xs),
    y: stripY(box.strip0),
    width: Math.abs(xs[1] - xs[0]),
    height: stripY(box.strip1) - stripY(box.strip0),
  }
}

/** Clockwise in the top view, as the backend turns footprints (layouts/board.py). */
export function rotate(x: number, y: number, rotation: number): [number, number] {
  if (rotation === 90) return [-y, x]
  if (rotation === 180) return [-x, -y]
  if (rotation === 270) return [y, -x]
  return [x, y]
}

/**
 * Where a part's pins land, as offsets in holes from its origin, from its footprint in
 * mm: for previews before the server answers. Pins off the grid or without a hole are
 * left out.
 */
export function footprintOffsets(pins: PinOut[], rotation: number): (Cell & { name: string })[] {
  const out: (Cell & { name: string })[] = []
  for (const pin of pins) {
    if (pin.x_mm == null || pin.y_mm == null) continue
    const [x, y] = rotate(pin.x_mm, pin.y_mm, rotation)
    const along = Math.round(x / PITCH_MM)
    const across = Math.round(y / PITCH_MM)
    if (Math.abs(x - along * PITCH_MM) > 0.1 || Math.abs(y - across * PITCH_MM) > 0.1) continue
    out.push({ name: pin.name, strip: across, hole: along })
  }
  return out
}

export type Turn = 0 | 90 | 180 | 270

export const nextRotation = (rotation: number) => ((rotation + 90) % 360) as Turn

/** The whole layout as the snapshot the API takes back: the canvas's undo. */
export function snapshotOf(layout: LayoutDetail): LayoutSnapshot {
  return {
    parts: layout.parts.map((p: LayoutPartOut) => ({
      placement_id: p.placement_id,
      ref: p.ref,
      on_board: p.on_board,
      strip: p.strip,
      hole: p.hole,
      rotation: p.rotation,
      mount: p.mount,
      footprint_sig: p.footprint_sig,
    })),
    cuts: layout.cuts.map(({ strip, hole, between }) => ({ strip, hole, between })),
    jumpers: layout.jumpers.map((j) => ({
      a_strip: j.a_strip,
      a_hole: j.a_hole,
      b_strip: j.b_strip,
      b_hole: j.b_hole,
      side: j.side,
      insulated: j.insulated,
      color: j.color,
    })),
    connectors: layout.connectors.map((c) => ({
      ref: c.ref,
      type: c.type,
      pin_count: c.pin_count,
      strip: c.strip,
      hole: c.hole,
      rotation: c.rotation,
      pins: c.pins.map((p) => ({ index: p.index, placement_id: p.placement_id, pin_id: p.pin_id })),
    })),
  }
}

// Net tints -----------------------------------------------------------------------------

const GROUND = /^(gnd|ground|vss|-)\d*(_\d+)?$/i
const SUPPLY = /^(\d+v\d*|\dv\d|3v3|5v|vin|vcc|vdd|v\+|raw|\+|vbat|vbus)\d*(_\d+)?$/i
const PALETTE = [
  'oklch(0.62 0.15 250)', // blue
  'oklch(0.66 0.15 150)', // green
  'oklch(0.6 0.17 300)', // purple
  'oklch(0.7 0.15 60)', // orange
  'oklch(0.66 0.12 195)', // teal
  'oklch(0.65 0.17 350)', // pink
  'oklch(0.75 0.14 95)', // yellow
]

/** Ground dark, supplies red, other nets from a fixed palette by name. */
export function netColor(net: string): string {
  if (GROUND.test(net)) return 'oklch(0.35 0.01 260)'
  if (SUPPLY.test(net)) return 'oklch(0.6 0.2 25)'
  let hash = 0
  for (const char of net) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
