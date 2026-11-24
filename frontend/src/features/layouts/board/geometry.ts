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

export interface Box {
  strip0: number
  hole0: number
  strip1: number
  hole1: number
}

/** A connector type's housing in mm from pin 1 (ConnectorTypeOut). */
export interface ConnectorOutline {
  end_mm: number
  back_mm: number
  front_mm: number
  clear_mm: number
}

/**
 * A connector's housing and the room its wires need in front, in board steps, with pin 1
 * at `at`: as the server works them out (layouts/board.py), for the preview before it's
 * put down. Lengths run along the board's holes, `step` holes between pins.
 */
export function connectorBoxes(
  outline: ConnectorOutline,
  pins: number,
  step: number,
  rotation: number,
  at: Cell,
  pitch: number,
): { body: Box; keepClear: Box | null } {
  const last = (pins - 1) * step * pitch
  const box = (x0: number, y0: number, x1: number, y1: number): Box => {
    const corners = [x0, x1].flatMap((x) => [y0, y1].map((y) => rotate(x, y, rotation)))
    const xs = corners.map(([x]) => x / pitch)
    const ys = corners.map(([, y]) => y / pitch)
    return {
      strip0: at.strip + Math.min(...ys),
      hole0: at.hole + Math.min(...xs),
      strip1: at.strip + Math.max(...ys),
      hole1: at.hole + Math.max(...xs),
    }
  }
  const { end_mm: end, back_mm: back, front_mm: front, clear_mm: clear } = outline
  return {
    body: box(-end, -back, last + end, front),
    keepClear: clear ? box(-end, front, last + end, front + clear) : null,
  }
}

/**
 * The front edge of a connector's housing, as a line: the side it faces (down the board
 * at rotation 0, turned clockwise), where a JST-XH's latch wall or a screw terminal's
 * wire entry is.
 */
export function frontEdge(
  box: Box,
  rotation: number,
  view: BoardView,
): { x1: number; y1: number; x2: number; y2: number } {
  const [along, across] = rotate(0, 1, rotation)
  const x0 = holeX(box.hole0, view)
  const x1 = holeX(box.hole1, view)
  const y0 = stripY(box.strip0)
  const y1 = stripY(box.strip1)
  if (across !== 0) {
    const y = across > 0 ? y1 : y0
    return { x1: x0, y1: y, x2: x1, y2: y }
  }
  const x = along > 0 ? x1 : x0
  return { x1: x, y1: y0, x2: x, y2: y1 }
}

/**
 * Where a part's pins land, as offsets in holes from its origin, from its footprint in
 * mm: for previews before the server answers. Pins off the grid or without a hole are
 * left out.
 */
export function footprintOffsets(
  pins: PinOut[],
  rotation: number,
  pitch: number = PITCH_MM,
): (Cell & { name: string })[] {
  const out: (Cell & { name: string })[] = []
  for (const pin of pins) {
    if (pin.x_mm == null || pin.y_mm == null) continue
    const [x, y] = rotate(pin.x_mm, pin.y_mm, rotation)
    const along = toSteps(x, pitch)
    const across = toSteps(y, pitch)
    if (along === null || across === null) continue
    out.push({ name: pin.name, strip: across, hole: along })
  }
  return out
}

/** mm along the board as whole holes, or null off the grid (within 0.1 mm, as the
 * backend's layouts/board.py). */
export function toSteps(mm: number, pitch: number = PITCH_MM): number | null {
  const steps = Math.round(mm / pitch)
  return Math.abs(mm - steps * pitch) <= 0.1 ? steps : null
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
    traces: layout.traces.map(({ a_strip, a_hole, b_strip, b_hole }) => ({
      a_strip,
      a_hole,
      b_strip,
      b_hole,
    })),
    connectors: layout.connectors.map((c) => ({
      ref: c.ref,
      type: c.type,
      pin_count: c.pin_count,
      strip: c.strip,
      hole: c.hole,
      rotation: c.rotation,
      color: c.color ?? null,
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
