// Wire label placement: each label sits on its own wire, where it overlaps no other
// label and no card, preferring the wire's own stretch (not a trunk it shares) and the
// middle of that. Pure, so it can be tested.
import type { Point, Rect } from './routing'

export interface LabelToPlace {
  id: string
  text: string
}

/** A label's size at 1×: 10 px monospace (6 px a character) with padding and border. */
export const labelSize = (text: string) => ({
  width: Math.ceil(text.length * 6.1) + 10,
  height: 17,
})

/** Clear space kept round a label, so neighbours don't touch. */
const GAP = 3
/** Keep labels off the pins: no closer to a wire's end than this, along the wire. */
const END_CLEARANCE = 24
/** Candidate spacing along a wire. */
const STEP = 5
const OVERLAP_COST = 50 // per px² of overlap with another label or a card
const SHARED_COST = 400 // on a stretch another wire runs along too
const OFF_MIDDLE_COST = 1 // per px from the middle of the wire's own stretch

interface Candidate extends Point {
  shared: boolean
  /** Distance along the wire. */
  at: number
}

/** The 10 px steps of a route, as keys, for telling shared stretches apart. */
function stepKeys(points: Point[]): string[] {
  const keys: string[] = []
  for (let i = 1; i < points.length; i++) {
    const [p, q] = [points[i - 1], points[i]]
    const n = Math.round(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) / 10)
    for (let k = 0; k < n; k++) keys.push(stepKey(p, q, (k + 0.5) / n))
  }
  return keys
}

/** The key of the 10 px step at fraction t of segment p→q. */
function stepKey(p: Point, q: Point, t: number): string {
  const x = p.x + (q.x - p.x) * t
  const y = p.y + (q.y - p.y) * t
  return p.y === q.y
    ? `h${Math.floor(x / 10)},${Math.round(y)}`
    : `v${Math.round(x)},${Math.floor(y / 10)}`
}

function candidates(points: Point[], uses: Map<string, number>): Candidate[] {
  const lengths = points
    .slice(1)
    .map((q, i) => Math.abs(q.x - points[i].x) + Math.abs(q.y - points[i].y))
  const total = lengths.reduce((a, b) => a + b, 0)
  const out: Candidate[] = []
  let start = 0
  for (let i = 0; i < lengths.length; i++) {
    const [p, q] = [points[i], points[i + 1]]
    for (let d = Math.ceil(start / STEP) * STEP; d <= start + lengths[i]; d += STEP) {
      if (d < END_CLEARANCE || d > total - END_CLEARANCE) continue
      const t = lengths[i] ? (d - start) / lengths[i] : 0
      out.push({
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
        at: d,
        shared: (uses.get(stepKey(p, q, Math.min(Math.max(t, 0.01), 0.99))) ?? 0) > 1,
      })
    }
    start += lengths[i]
  }
  // Too short to keep clear of both ends: its middle.
  if (!out.length && total) {
    let half = total / 2
    for (let i = 0; i < lengths.length; i++) {
      if (half <= lengths[i]) {
        const [p, q] = [points[i], points[i + 1]]
        const t = lengths[i] ? half / lengths[i] : 0
        out.push({
          x: p.x + (q.x - p.x) * t,
          y: p.y + (q.y - p.y) * t,
          at: total / 2,
          shared: false,
        })
        break
      }
      half -= lengths[i]
    }
  }
  return out
}

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * Where to centre each label, by wire id. `routes` are every wire's routed points (so
 * shared stretches are known); a label whose wire has no route is left out, and the
 * caller places it its own way.
 */
export function placeLabels(
  routes: Map<string, Point[]>,
  labels: LabelToPlace[],
  cards: Rect[],
): Map<string, Point> {
  const uses = new Map<string, number>()
  for (const points of routes.values())
    for (const key of new Set(stepKeys(points))) uses.set(key, (uses.get(key) ?? 0) + 1)

  const todo = labels
    .filter((l) => routes.get(l.id)?.length)
    .map((l) => ({ ...l, options: candidates(routes.get(l.id)!, uses) }))
    .filter((l) => l.options.length)
  // Fewest places to go first; then by id, so the result is stable.
  todo.sort((a, b) => a.options.length - b.options.length || a.id.localeCompare(b.id))

  const placed: Rect[] = []
  const out = new Map<string, Point>()
  for (const { id, text, options } of todo) {
    const { width, height } = labelSize(text)
    const own = options.filter((o) => !o.shared)
    const span = own.length ? own : options
    const middle = (span[0].at + span.at(-1)!.at) / 2
    let best = options[0]
    let bestCost = Infinity
    for (const o of options) {
      const box = {
        x: o.x - width / 2 - GAP,
        y: o.y - height / 2 - GAP,
        width: width + 2 * GAP,
        height: height + 2 * GAP,
      }
      let cost = Math.abs(o.at - middle) * OFF_MIDDLE_COST + (o.shared ? SHARED_COST : 0)
      for (const r of placed) cost += overlap(box, r) * OVERLAP_COST
      for (const c of cards) cost += overlap(box, c) * OVERLAP_COST
      if (cost < bestCost) [best, bestCost] = [o, cost]
    }
    placed.push({
      x: best.x - width / 2 - GAP,
      y: best.y - height / 2 - GAP,
      width: width + 2 * GAP,
      height: height + 2 * GAP,
    })
    out.set(id, { x: best.x, y: best.y })
  }
  return out
}
