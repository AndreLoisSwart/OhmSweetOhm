// Wire routing: square paths on the grid that go around cards instead of through them,
// and spread apart instead of running on top of each other. Pure, so it can be tested.
//
// Each wire leaves its pin straight out for STUB px, then an A* search on the 10 px grid
// finds the cheapest path to the other pin's stub: steps cost 1, turns cost extra, and
// running alongside an earlier wire costs more, so parallel wires take neighbouring
// tracks. Cards (with a margin) and other pins' stubs are walls.
//
// Wires that share pins are routed together as a tree: the first pin to pin, then each
// further pin to the nearest point of what's already there, so branches meet the trunk
// in a clean T. Each wire is drawn as its path through the tree. Running on a track of
// the wire's own net (another group on it) is cheaper than a fresh step, and the points
// where a net branches are returned as junctions (drawn as dots, as on a schematic).
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
  /** The net the wire is on; wires on the same net may share tracks. */
  net?: string
}

/** Where a net's shared trunk branches (three or more ways meet). */
export interface Junction extends Point {
  net: string
}

export interface Routing {
  routes: Map<string, Point[]>
  junctions: Junction[]
}

/** How far a wire runs straight out of its pin before it may turn. */
export const STUB = 20
const TURN_COST = 4
const PARALLEL_COST = 8
/** Running one track beside another wire: keeps parallel wires 20 px apart where there's room. */
const NEIGHBOUR_COST = 3
const CROSS_COST = 1
/** A step along a track the wire's own net already uses: cheaper than a fresh one, so a
 * rail's wires join up even at the price of a short detour. */
const SHARED_STEP = 0.5
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
const dirOf = (dx: number, dy: number) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3)
/** From a pin's stub end back to the pin. */
const towardPin = (end: WireEnd) => dirOf(-OUT[end.side].x, -OUT[end.side].y)

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

/** Each wire's corner points from pin to pin (see route). */
export function routeWires(cards: Rect[], wires: WireToRoute[]): Map<string, Point[]> {
  return route(cards, wires).routes
}

/** A pin's identity for grouping: wires sharing a pin are joined. */
const pinKey = (e: WireEnd) => `${e.x},${e.y},${e.side}`

/** Groups wires that share pins, so each group can be drawn as one tree. */
function groupsOf(wires: WireToRoute[]): WireToRoute[][] {
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  for (const w of wires)
    for (const e of [w.a, w.b]) if (!parent.has(pinKey(e))) parent.set(pinKey(e), pinKey(e))
  for (const w of wires) parent.set(find(pinKey(w.a)), find(pinKey(w.b)))
  const groups = new Map<string, WireToRoute[]>()
  for (const w of wires) {
    const r = find(pinKey(w.a))
    groups.set(r, [...(groups.get(r) ?? []), w])
  }
  return [...groups.values()]
}

/**
 * Routes every wire. Returns each wire's corner points from pin to pin, or nothing for a
 * wire with no path (the caller draws those its simple way), and the junctions where a
 * group's tree branches.
 *
 * Wires that share pins form a group, routed as one tree: its shortest wire first, pin
 * to pin, then each further pin (nearest first) to the nearest point of the tree. Each
 * wire is drawn as the path through the tree between its own two pins.
 */
export function route(cards: Rect[], wires: WireToRoute[]): Routing {
  const routes = new Map<string, Point[]>()
  const junctions: Junction[] = []
  if (!wires.length) return { routes, junctions }

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
  const toPoint = (c: number): Point => ({
    x: minX + (c % cols) * GRID,
    y: minY + Math.floor(c / cols) * GRID,
  })
  const dirBetween = (from: number, to: number) =>
    dirOf((to % cols) - (from % cols), Math.floor(to / cols) - Math.floor(from / cols))

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
  // passes. A search opens its own start; its goals may always be entered.
  const stubEnds = new Set<number>()
  for (const w of wires) for (const end of [w.a, w.b]) stubEnds.add(cell(stubOf(end)))
  for (const c of stubEnds) wall[c] = 1

  // How many earlier tracks run through each point, horizontally and vertically.
  const usedH = new Uint16Array(cols * rows)
  const usedV = new Uint16Array(cols * rows)
  // The same, for the net being routed only: filled from netCells before each group.
  const sameH = new Uint16Array(cols * rows)
  const sameV = new Uint16Array(cols * rows)
  // The cells each net's tracks run through, and the directions met at each cell, for
  // finding junctions.
  const netCells = new Map<string, { h: number[]; v: number[] }>()
  const netDirs = new Map<string, Map<number, number>>()

  const cost = new Float64Array(cols * rows * 4)
  const came = new Int32Array(cols * rows * 4)

  /**
   * The cheapest path of cells from `start` (leaving in `firstDir`) to any cell `isGoal`
   * accepts, or null. `h` is a lower bound on the steps left; `arrive` adds the cost of
   * entering a goal in a direction.
   */
  function search(
    start: number,
    firstDir: number,
    isGoal: (c: number) => boolean,
    h: (c: number) => number,
    arrive: (c: number, d: number) => number,
  ): number[] | null {
    const reopen = wall[start] && stubEnds.has(start)
    if (reopen) wall[start] = 0
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
      if (isGoal(c)) {
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
        const goal = isGoal(n)
        if (wall[n] && !goal) continue
        const horizontal = d === 0 || d === 2
        const used = horizontal ? usedH : usedV
        const same = horizontal ? sameH : sameV
        // Other nets only: the wire's own net may share, run beside and cross itself.
        const others = (c: number) => used[c] - same[c]
        let step = (same[n] ? SHARED_STEP : 1) + (d !== dir ? TURN_COST : 0)
        step += others(n) * PARALLEL_COST
        const side = horizontal ? cols : 1
        step +=
          ((n >= side ? others(n - side) : 0) + (n + side < used.length ? others(n + side) : 0)) *
          NEIGHBOUR_COST
        step += (horizontal ? usedV[n] - sameV[n] : usedH[n] - sameH[n]) * CROSS_COST
        if (goal) step += arrive(n, d)
        const next = n * 4 + d
        const total = here + step
        if (total < cost[next]) {
          cost[next] = total
          came[next] = state
          heap.push(total + h(n), next)
        }
      }
    }
    if (reopen) wall[start] = 1
    if (found < 0) return null
    const cells: number[] = []
    for (let s = found; s !== -1; s = came[s]) cells.push(s >> 2)
    return cells.reverse()
  }

  // Smaller groups first (by the box round their pins): they have the fewest ways round,
  // and big ones can make room.
  const span = (ends: WireEnd[]) =>
    Math.max(...ends.map((e) => e.x)) -
    Math.min(...ends.map((e) => e.x)) +
    Math.max(...ends.map((e) => e.y)) -
    Math.min(...ends.map((e) => e.y))
  const wireSpan = (w: WireToRoute) => span([w.a, w.b])
  const groups = groupsOf(wires)
    .map((g) => [...g].sort((p, q) => wireSpan(p) - wireSpan(q) || p.id.localeCompare(q.id)))
    .map((g) => ({ wires: g, span: span(g.flatMap((w) => [w.a, w.b])) }))
    .sort((p, q) => p.span - q.span || p.wires[0].id.localeCompare(q.wires[0].id))

  for (const { wires: group } of groups) {
    const net = group[0].net ?? `\0${group[0].id}`
    const mine = netCells.get(net) ?? { h: [], v: [] }
    const dirs = netDirs.get(net) ?? new Map<number, number>()
    const meet = (c: number, d: number) => dirs.set(c, (dirs.get(c) ?? 0) | (1 << d))
    for (const c of mine.h) sameH[c]++
    for (const c of mine.v) sameV[c]++

    // The group's tree: cells and the steps between them.
    const tree = new Map<number, Set<number>>()
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    const addCell = (c: number) => {
      if (!tree.has(c)) tree.set(c, new Set())
      const [x, y] = [c % cols, Math.floor(c / cols)]
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x)
      box.y0 = Math.min(box.y0, y)
      box.y1 = Math.max(box.y1, y)
    }
    const addPath = (cells: number[]) => {
      addCell(cells[0])
      for (let i = 1; i < cells.length; i++) {
        const [p, c] = [cells[i - 1], cells[i]]
        addCell(c)
        if (tree.get(p)!.has(c)) continue
        tree.get(p)!.add(c)
        tree.get(c)!.add(p)
        const horizontal = Math.abs(c - p) === 1
        for (const k of [p, c]) {
          ;(horizontal ? usedH : usedV)[k]++
          ;(horizontal ? sameH : sameV)[k]++
          ;(horizontal ? mine.h : mine.v).push(k)
        }
        const d = dirBetween(p, c)
        meet(p, d)
        meet(c, (d + 2) & 3)
      }
    }

    const ends = new Map<string, WireEnd>()
    for (const w of group) for (const e of [w.a, w.b]) ends.set(pinKey(e), e)
    const joined = new Set<string>()
    const join = (e: WireEnd) => {
      joined.add(pinKey(e))
      meet(cell(stubOf(e)), towardPin(e))
    }
    const firstDir = (e: WireEnd) => ({ left: 2, right: 0, top: 3, bottom: 1 })[e.side]
    const intoPin = (e: WireEnd) => ({ left: 0, right: 2, top: 1, bottom: 3 })[e.side]

    // Start the tree with the shortest wire that finds a path, pin to pin.
    for (const w of group) {
      const goal = cell(stubOf(w.b))
      const [gx, gy] = [goal % cols, Math.floor(goal / cols)]
      const cells = search(
        cell(stubOf(w.a)),
        firstDir(w.a),
        (c) => c === goal,
        (c) => Math.abs((c % cols) - gx) + Math.abs(Math.floor(c / cols) - gy),
        (_, d) => (d !== intoPin(w.b) ? TURN_COST : 0),
      )
      if (!cells) continue
      addPath(cells)
      join(w.a)
      join(w.b)
      break
    }

    // Then each further pin, nearest first, to the nearest point of the tree.
    const toBox = (c: number) => {
      const [x, y] = [c % cols, Math.floor(c / cols)]
      return Math.max(box.x0 - x, 0, x - box.x1) + Math.max(box.y0 - y, 0, y - box.y1)
    }
    const distance = (c: number) => {
      const [x, y] = [c % cols, Math.floor(c / cols)]
      let best = Infinity
      for (const t of tree.keys())
        best = Math.min(best, Math.abs((t % cols) - x) + Math.abs(Math.floor(t / cols) - y))
      return best
    }
    const left = new Set(tree.size ? [...ends.keys()].filter((k) => !joined.has(k)) : [])
    while (left.size) {
      let next = ''
      let nearest = Infinity
      for (const k of left) {
        const d = distance(cell(stubOf(ends.get(k)!)))
        if (d < nearest || (d === nearest && k < next)) [next, nearest] = [k, d]
      }
      left.delete(next)
      const e = ends.get(next)!
      const start = cell(stubOf(e))
      if (tree.has(start)) {
        join(e)
        continue
      }
      const cells = search(
        start,
        firstDir(e),
        (c) => tree.has(c),
        toBox,
        () => 0,
      )
      if (!cells) continue
      addPath(cells)
      join(e)
    }

    // Everything in mine was counted in same: what was loaded and what addPath added.
    for (const c of mine.h) sameH[c]--
    for (const c of mine.v) sameV[c]--
    netCells.set(net, mine)
    netDirs.set(net, dirs)

    // Each wire: the path through the tree between its pins' stub ends.
    for (const w of group) {
      if (!joined.has(pinKey(w.a)) || !joined.has(pinKey(w.b))) continue
      const path = treePath(tree, cell(stubOf(w.a)), cell(stubOf(w.b)))
      if (!path) continue
      routes.set(
        w.id,
        simplify([{ x: w.a.x, y: w.a.y }, ...path.map(toPoint), { x: w.b.x, y: w.b.y }]),
      )
    }
  }

  // Three or more ways meeting on one net is a branch (or the net crossing itself).
  for (const [net, dirs] of netDirs) {
    if (net.startsWith('\0')) continue
    for (const [c, mask] of dirs) {
      let ways = 0
      for (let m = mask; m; m &= m - 1) ways++
      if (ways >= 3) junctions.push({ ...toPoint(c), net })
    }
  }
  return { routes, junctions }
}

/** The fewest-steps path between two cells of a tree (a breadth-first search). */
function treePath(tree: Map<number, Set<number>>, from: number, to: number): number[] | null {
  if (from === to) return [from]
  const back = new Map<number, number>([[from, from]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    for (const n of tree.get(queue[i]) ?? []) {
      if (back.has(n)) continue
      back.set(n, queue[i])
      if (n === to) {
        const path = [to]
        while (path.at(-1) !== from) path.push(back.get(path.at(-1)!)!)
        return path.reverse()
      }
      queue.push(n)
    }
  }
  return null
}

/** How far React Flow's end of a wire may be from its routed pin before the route is
 * taken as stale. Its handle ends sit up to half a dot (5 px) off the pin's centre. */
export const ROUTE_TOLERANCE = 8

/**
 * The route to draw for a wire whose ends React Flow puts at `source` and `target`, or
 * null when the route no longer meets them (a card is being dragged and isn't saved yet).
 *
 * The route is drawn exactly as computed: its ends come from the same card layout that
 * places the pin dots, so they are the pins' centres. React Flow's measured handle
 * positions only decide whether the route is stale; joining the route to them instead
 * drew a slanted last stretch whenever a measurement came out a few pixels off.
 */
export function routeFor(route: Point[] | undefined, source: Point, target: Point): Point[] | null {
  if (!route || route.length < 2) return null
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= ROUTE_TOLERANCE
  return near(route[0], source) && near(route.at(-1)!, target) ? route : null
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
