// The board's tools (build step 17): what a pointer on the board means for each.
// Pure, so it can be tested without React.
import type { ConnectorType, LayoutDetail } from '@/api/generated/model'
import { type BoardView, type Cell, cellAt, cellLabel, holeX, STEP } from './geometry'

export type Tool = 'select' | 'cut' | 'jumper' | 'connector'

/** What's selected on the board. */
export type Selection =
  | { kind: 'part'; id: number }
  | { kind: 'jumper'; id: number }
  | { kind: 'connector'; id: number }
  | null

export interface CutTarget extends Cell {
  /** Between this hole and the next one (hole + 1), not at it. */
  between: boolean
}

/** Pointing this close to the gap between two holes means a cut between them. */
const GAP = 0.3

/**
 * The cut a point on the drawing means: at the nearest hole, or, near the gap between
 * two holes along a strip, between them. Mirrored in the bottom view.
 */
export function cutTarget(x: number, y: number, view: BoardView): CutTarget {
  const cell = cellAt(x, y, view)
  const offset = (x - holeX(cell.hole, view)) / STEP // -0.5…0.5, to the right on screen
  if (Math.abs(offset) < GAP) return { ...cell, between: false }
  // To the right on screen is the next hole up, unless the board is turned over.
  const towardsNext = offset > 0 !== view.flipped
  return { strip: cell.strip, hole: towardsNext ? cell.hole : cell.hole - 1, between: true }
}

export const cutKey = (c: CutTarget) => `${c.strip}:${c.hole}:${c.between ? 'b' : 'h'}`

/** Holes with a leg, a connector pin or a top jumper end in them, by label. */
export function takenHoles(layout: LayoutDetail): Map<string, string> {
  const taken = new Map<string, string>()
  for (const part of layout.parts) for (const pin of part.pins) taken.set(pin.at, pin.key)
  for (const c of layout.connectors)
    for (const p of c.pins)
      if (p.strip != null && p.hole != null)
        taken.set(cellLabel({ strip: p.strip, hole: p.hole }), `${c.ref} pin ${p.index}`)
  for (const j of layout.jumpers)
    if (j.side === 'top') {
      taken.set(j.a, 'a jumper')
      taken.set(j.b, 'a jumper')
    }
  return taken
}

export const inside = (cell: Cell, layout: LayoutDetail) =>
  cell.strip >= 1 && cell.strip <= layout.strips && cell.hole >= 1 && cell.hole <= layout.holes

export const CONNECTOR_TYPES: { type: ConnectorType; label: string; step: number }[] = [
  { type: 'header_female', label: 'Female header', step: 1 },
  { type: 'header_male', label: 'Male header', step: 1 },
  { type: 'jst_xh', label: 'JST-XH', step: 1 },
  { type: 'screw_508', label: 'Screw terminal 5.08', step: 2 },
]

export interface ConnectorDraft {
  type: ConnectorType
  pinCount: number
  /** What each pin carries, when made for an off-board part from the tray. */
  pins: (string | null)[]
  /** Turned before it's put down (R): 0, 90, 180 or 270. */
  rotation: 0 | 90 | 180 | 270
}
