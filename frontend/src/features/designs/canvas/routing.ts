// Wire routing: square paths on the grid that go around cards instead of through them,
// and spread apart instead of running on top of each other. Pure, so it can be tested.
//
// Each wire leaves its pin straight out for STUB px, then an A* search on the 10 px grid
// finds the cheapest path to the other pin's stub: steps cost 1, turns cost extra, and
// running alongside an earlier wire costs more, so parallel wires take neighbouring
// tracks. Cards (with a margin) and other pins' stubs are walls.
import type { PinSide } from '@/api/generated/model'
import { GRID } from '@/features/parts/card/layout'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface WireEnd extends Point {
  side: PinSide
}

export interface WireToRoute {
  id: string
  a: WireEnd
  b: WireEnd
}

/** How far a wire runs straight out of its pin before it may turn. */
export const STUB = 20
const TURN_COST = 4
const PARALLEL_COST = 8
/** Running one track beside another wire: keeps parallel wires 20 px apart where there's room. */
const NEIGHBOUR_COST = 3
const CROSS_COST = 1
/** Room around everything for wires that must go round the outside. */
const MARGIN = 200
const MAX_EXPANSIONS = 60_000

const OUT: Record<PinSide, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

export const stubOf = (end: WireEnd): Point => ({
  x: end.x + OUT[end.side].x * STUB,
  y: end.y + OUT[end.side].y * STUB,
})

// Directions: 0 right, 1 down, 2 left, 3 up.
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

/** A binary heap of [priority, state]. */
class Heap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(priority: number, value: number) {
    const items = this.items
    items.push([priority, value])
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent][0] <= items[i][0]) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop(): number {
    const items = this.items
    const top = items[0][1]
    const last = items.pop()!
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && items[l][0] < items[m][0]) m = l
        if (r < items.length && items[r][0] < items[m][0]) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}

/** Drops the middle points of straight runs. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const n = out.length
    if (n && out[n - 1].x === p.x && out[n - 1].y === p.y) continue
    if (
      n >= 2 &&
      ((out[n - 2].x === out[n - 1].x && out[n - 1].x === p.x) ||
        (out[n - 2].y === out[n - 1].y && out[n - 1].y === p.y))
    ) {
      out[n - 1] = p
    } else out.push(p)
  }
  return out
}

/**
 * Routes every wire. Returns each wire's corner points from pin to pin, or nothing for a
 * wire with no path (the caller draws those its simple way).
 */
export function routeWires(cards: Rect[], wires: WireToRoute[]): Map<string, Point[]> {
  const routes = new Map<string, Point[]>()
  if (!wires.length) return routes

  // The search area: everything, plus room to go round the outside.
  const xs = [
    ...cards.flatMap((c) => [c.x, c.x + c.width]),
    ...wires.flatMap((w) => [w.a.x, w.b.x]),
  ]
  const ys = [
    ...cards.flatMap((c) => [c.y, c.y + c.height]),
    ...wires.flatMap((w) => [w.a.y, w.b.y]),
  ]
  const minX = Math.floor((Math.min(...xs) - MARGIN) / GRID) * GRID
  const minY = Math.floor((Math.min(...ys) - MARGIN) / GRID) * GRID
  const cols = Math.ceil((Math.max(...xs) + MARGIN - minX) / GRID) + 1
  const rows = Math.ceil((Math.max(...ys) + MARGIN - minY) / GRID) + 1
  const cell = (p: Point) =>
    Math.round((p.y - minY) / GRID) * cols + Math.round((p.x - minX) / GRID)

  // Walls: inside a card or within a stub's length of it, so wires keep clear of labels
  // and don't run along the pins. Points exactly STUB away are free: that's where stubs end.
  const wall = new Uint8Array(cols * rows)
  for (const c of cards) {
    const x0 = Math.ceil((c.x - STUB + 1 - minX) / GRID)
    const x1 = Math.floor((c.x + c.width + STUB - 1 - minX) / GRID)
    const y0 = Math.ceil((c.y - STUB + 1 - minY) / GRID)
    const y1 = Math.floor((c.y + c.height + STUB - 1 - minY) / GRID)
    for (let y = Math.max(y0, 0); y <= Math.min(y1, rows - 1); y++)
      for (let x = Math.max(x0, 0); x <= Math.min(x1, cols - 1); x++) wall[y * cols + x] = 1
  }
  // Every pin's stub end is a wall for other wires, so no wire seems to touch a pin it
  // passes. Each wire opens its own two ends.
  const stubEnds = new Set<number>()
  for (const w of wires) for (const end of [w.a, w.b]) stubEnds.add(cell(stubOf(end)))
  for (const c of stubEnds) wall[c] = 1

  // How many earlier wires run through each point, horizontally and vertically.
  const usedH = new Uint16Array(cols * rows)
  const usedV = new Uint16Array(cols * rows)

  // Shorter wires first: they have the fewest ways round, and long ones can make room.
  const span = (w: WireToRoute) => Math.abs(w.a.x - w.b.x) + Math.abs(w.a.y - w.b.y)
  const order = [...wires].sort((p, q) => span(p) - span(q) || p.id.localeCompare(q.id))

  const cost = new Float64Array(cols * rows * 4)
  const came = new Int32Array(cols * rows * 4)

  for (const w of order) {
    const startPoint = stubOf(w.a)
    const goalPoint = stubOf(w.b)
    const start = cell(startPoint)
    const goal = cell(goalPoint)
    const opened = [start, goal].filter((c) => wall[c] && stubEnds.has(c))
    for (const c of opened) wall[c] = 0
    // Leaving, the wire carries on out of its pin; arriving, it should be heading into
    // the other pin, or it pays for a turn.
    const firstDir = { left: 2, right: 0, top: 3, bottom: 1 }[w.a.side]
    const goalDir = { left: 0, right: 2, top: 1, bottom: 3 }[w.b.side]

    const gx = goal % cols
    const gy = Math.floor(goal / cols)
    const h = (c: number) => Math.abs((c % cols) - gx) + Math.abs(Math.floor(c / cols) - gy)

    cost.fill(Infinity)
    const heap = new Heap()
    const s0 = start * 4 + firstDir
    cost[s0] = 0
    came[s0] = -1
    heap.push(h(start), s0)
    let found = -1
    let expansions = 0
    while (heap.size && expansions++ < MAX_EXPANSIONS) {
      const state = heap.pop()
      const c = state >> 2
      const dir = state & 3
      if (c === goal) {
        found = state
        break
      }
      const here = cost[state]
      const x = c % cols
      const y = Math.floor(c / cols)
      for (let d = 0; d < 4; d++) {
        if (d === ((dir + 2) & 3)) continue // no U-turns
        const nx = x + DX[d]
        const ny = y + DY[d]
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const n = ny * cols + nx
        if (wall[n] && n !== goal) continue
        const horizontal = d === 0 || d === 2
        let step = 1 + (d !== dir ? TURN_COST : 0)
        step += (horizontal ? usedH[n] : usedV[n]) * PARALLEL_COST
        const side = horizontal ? cols : 1
        const used = horizontal ? usedH : usedV
        step +=
          ((n >= side ? used[n - side] : 0) + (n + side < used.length ? used[n + side] : 0)) *
          NEIGHBOUR_COST
        step += (horizontal ? usedV[n] : usedH[n]) * CROSS_COST
        if (n === goal && d !== goalDir) step += TURN_COST
        const next = n * 4 + d
        const total = here + step
        if (total < cost[next]) {
          cost[next] = total
          came[next] = state
          heap.push(total + h(n), next)
        }
      }
    }
    for (const c of opened) wall[c] = 1
    if (found < 0) continue

    const cells: number[] = []
    for (let s = found; s !== -1; s = came[s]) cells.push(s >> 2)
    cells.reverse()
    for (let i = 1; i < cells.length; i++) {
      const horizontal = Math.abs(cells[i] - cells[i - 1]) === 1
      for (const c of [cells[i - 1], cells[i]]) (horizontal ? usedH : usedV)[c]++
    }
    const toPoint = (c: number): Point => ({
      x: minX + (c % cols) * GRID,
      y: minY + Math.floor(c / cols) * GRID,
    })
    routes.set(
      w.id,
      simplify([{ x: w.a.x, y: w.a.y }, ...cells.map(toPoint), { x: w.b.x, y: w.b.y }]),
    )
  }
  return routes
}

/** An SVG path through the points, with rounded corners. */
export function roundedPath(points: Point[], radius = 6): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const [p, c, n] = [points[i - 1], points[i], points[i + 1]]
    const r = Math.min(
      radius,
      Math.hypot(c.x - p.x, c.y - p.y) / 2,
      Math.hypot(n.x - c.x, n.y - c.y) / 2,
    )
    const inX = c.x - Math.sign(c.x - p.x) * r
    const inY = c.y - Math.sign(c.y - p.y) * r
    const outX = c.x + Math.sign(n.x - c.x) * r
    const outY = c.y + Math.sign(n.y - c.y) * r
    d += ` L ${inX} ${inY} Q ${c.x} ${c.y} ${outX} ${outY}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/** The point halfway along the path, for a wire's label. */
export function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let half = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (half <= lengths[i]) {
      const t = lengths[i] ? half / lengths[i] : 0
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      }
    }
    half -= lengths[i]
  }
  return points[0]
}
