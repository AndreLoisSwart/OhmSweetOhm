import type { Cell } from './geometry'
import { straightEnd } from './tools'

/** A jumper's two ends, as the API takes them. */
export interface JumperEnds {
  a_strip: number
  a_hole: number
  b_strip: number
  b_hole: number
}

/** What a drag holds: one end (the other stays put), or the whole jumper. */
export type Grab = 'a' | 'b' | 'body'

/**
 * Turns a hole a quarter clockwise about the pivot, as the board is seen: on the copper
 * side (flipped) the holes run the other way, so clockwise there is the other way round.
 */
function turn(cell: Cell, pivot: Cell, flipped: boolean): Cell {
  const ds = cell.strip - pivot.strip
  const dh = cell.hole - pivot.hole
  // Seen from the top, holes run right and strips down: clockwise takes right to down.
  return flipped
    ? { strip: pivot.strip - dh, hole: pivot.hole + ds }
    : { strip: pivot.strip + dh, hole: pivot.hole - ds }
}

/** The jumper turned a quarter clockwise `turns` times about the pivot. */
export function turnJumper(
  ends: JumperEnds,
  pivot: Cell,
  turns: number,
  flipped: boolean,
): JumperEnds {
  let a: Cell = { strip: ends.a_strip, hole: ends.a_hole }
  let b: Cell = { strip: ends.b_strip, hole: ends.b_hole }
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    a = turn(a, pivot, flipped)
    b = turn(b, pivot, flipped)
  }
  return { a_strip: a.strip, a_hole: a.hole, b_strip: b.strip, b_hole: b.hole }
}

/** The hole in the middle of a jumper, rounded towards its first end. */
export function middleOf(ends: JumperEnds): Cell {
  const half = (from: number, to: number) => from + Math.trunc((to - from) / 2)
  return { strip: half(ends.a_strip, ends.b_strip), hole: half(ends.a_hole, ends.b_hole) }
}

/**
 * Where a dragged jumper ends up: an end moved by the drag, or the whole jumper turned
 * about the hole it was grabbed by, then moved.
 */
export function movedJumper(
  ends: JumperEnds,
  grab: Grab,
  by: { dStrip: number; dHole: number },
  turns = 0,
  pivot: Cell = middleOf(ends),
  flipped = false,
): JumperEnds {
  if (grab === 'a')
    return { ...ends, a_strip: ends.a_strip + by.dStrip, a_hole: ends.a_hole + by.dHole }
  if (grab === 'b')
    return { ...ends, b_strip: ends.b_strip + by.dStrip, b_hole: ends.b_hole + by.dHole }
  const t = turnJumper(ends, pivot, turns, flipped)
  return {
    a_strip: t.a_strip + by.dStrip,
    a_hole: t.a_hole + by.dHole,
    b_strip: t.b_strip + by.dStrip,
    b_hole: t.b_hole + by.dHole,
  }
}

export const sameEnds = (x: JumperEnds, y: JumperEnds) =>
  x.a_strip === y.a_strip &&
  x.a_hole === y.a_hole &&
  x.b_strip === y.b_strip &&
  x.b_hole === y.b_hole

/**
 * Where a dragged trace ends up: as a jumper would, but a moved end stays on the other
 * end's row or column, so the trace stays straight.
 */
export function movedTrace(
  ends: JumperEnds,
  grab: Grab,
  by: { dStrip: number; dHole: number },
  turns = 0,
  pivot: Cell = middleOf(ends),
  flipped = false,
): JumperEnds {
  const moved = movedJumper(ends, grab, by, turns, pivot, flipped)
  if (grab === 'body') return moved
  const a = { strip: moved.a_strip, hole: moved.a_hole }
  const b = { strip: moved.b_strip, hole: moved.b_hole }
  if (grab === 'a') {
    const end = straightEnd(b, a)
    return { ...moved, a_strip: end.strip, a_hole: end.hole }
  }
  const end = straightEnd(a, b)
  return { ...moved, b_strip: end.strip, b_hole: end.hole }
}
