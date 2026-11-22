// Path tracing (build step 23): the copper path between two holes or pins, from what
// the API says joins what. Pure, so it can be tested. The server stays the judge of
// connectivity (layouts/board.py); this only finds a route through the same joins.
import type { DesignDetail, LayoutDetail } from '@/api/generated/model'
import { type Cell, cellLabel } from './geometry'

/** One end of a path: a hole, and the pin in it when there is one. */
export interface PathEnd {
  cell: Cell
  at: string
  pin?: string
  /**
   * A connector pin carrying a pin of a part that's on the board (a test point): no
   * cable joins them, so the path starts at its hole, on that pin's net.
   */
  carries?: string
  /** That connector pin, as `J1 pin 2`. */
  connector?: string
}

/** Pins of parts on the board, by key. */
const onBoardPins = (layout: LayoutDetail) =>
  new Set(layout.parts.flatMap((part) => part.pins.map((pin) => pin.key)))

/** A stretch drawn from one hole to another. */
export interface Span {
  from: Cell
  to: Cell
}

export type PathKind =
  /** Joined, and the design joins them too. */
  | 'same'
  /** Joined, but the design keeps them apart: a short. */
  | 'short'
  /** Joined; one end is a bare hole, so there's no net to compare. */
  | 'joined'
  /** Not joined, though the design joins them: still to do. */
  | 'missing'
  /** Not joined, and the design doesn't join them either. */
  | 'apart'

export interface PathResult {
  a: PathEnd
  b: PathEnd
  kind: PathKind
  /** Copper used, run by run: only the stretch between where the path enters and leaves. */
  copper: Span[]
  /** Jumpers and traces used, by id, each from the hole the path enters by to the one it leaves by. */
  jumpers: (Span & { id: number })[]
  traces: (Span & { id: number })[]
  /** Pins joined inside a part on the way (a board's GND and GND2), as pin keys. */
  inside: { a: string; b: string }[]
  /** Pins and holes on the path. */
  pins: string[]
  holes: string[]
  /** Connectors the path goes through, by ref. */
  connectors: string[]
  /** Not joined: the holes each end reaches. */
  reachA: string[]
  reachB: string[]
  /** The design's net (or a pin's own identity) at each pinned end. */
  netA?: string
  netB?: string
  /** Whether that net is one of the design's (an unwired pin is only itself). */
  wiredA: boolean
  wiredB: boolean
}

type Graph = Map<string, Set<string>>

const hole = (at: string) => `h:${at}`

function link(graph: Graph, x: string, y: string) {
  if (!graph.has(x)) graph.set(x, new Set())
  if (!graph.has(y)) graph.set(y, new Set())
  graph.get(x)!.add(y)
  graph.get(y)!.add(x)
}

/** Every hole, pin, jumper, trace, connector pin and in-part join, and what joins them. */
export function boardGraph(layout: LayoutDetail): Graph {
  const graph: Graph = new Map()
  const placed = onBoardPins(layout)
  for (const seg of layout.segments) {
    const cells: Cell[] = []
    if (seg.a_strip === seg.b_strip)
      for (let h = Math.min(seg.a_hole, seg.b_hole); h <= Math.max(seg.a_hole, seg.b_hole); h++)
        cells.push({ strip: seg.a_strip, hole: h })
    else
      for (let s = Math.min(seg.a_strip, seg.b_strip); s <= Math.max(seg.a_strip, seg.b_strip); s++)
        cells.push({ strip: s, hole: seg.a_hole })
    for (let i = 1; i < cells.length; i++)
      link(graph, hole(cellLabel(cells[i - 1])), hole(cellLabel(cells[i])))
  }
  for (const j of layout.jumpers) for (const at of j.touches) link(graph, `j:${j.id}`, hole(at))
  for (const t of layout.traces) for (const at of t.touches) link(graph, `t:${t.id}`, hole(at))
  for (const part of layout.parts)
    for (const pin of part.pins) link(graph, `p:${pin.key}`, hole(pin.at))
  for (const c of layout.connectors)
    for (const p of c.pins) {
      const node = `c:${c.ref}:${p.index}`
      if (p.strip != null && p.hole != null)
        link(graph, node, hole(cellLabel({ strip: p.strip, hole: p.hole })))
      // A cable to an off-board part's pin; a pin on the board is reached by copper only.
      if (p.pin && !placed.has(p.pin)) link(graph, node, `p:${p.pin}`)
    }
  layout.joins.forEach((group, i) => {
    for (const key of group) link(graph, `g:${i}`, `p:${key}`)
  })
  return graph
}

/** What's at a hole: the part pin in it, else the off-board pin a connector carries there. */
export function endAt(layout: LayoutDetail, cell: Cell): PathEnd {
  const at = cellLabel(cell)
  for (const part of layout.parts)
    for (const pin of part.pins) if (pin.at === at) return { cell, at, pin: pin.key }
  const placed = onBoardPins(layout)
  for (const c of layout.connectors)
    for (const p of c.pins)
      if (p.pin && p.strip === cell.strip && p.hole === cell.hole)
        return placed.has(p.pin)
          ? { cell, at, carries: p.pin, connector: `${c.ref} pin ${p.index}` }
          : { cell, at, pin: p.pin }
  return { cell, at }
}

const nodeOf = (end: PathEnd) => (end.pin ? `p:${end.pin}` : hole(end.at))

/** Breadth-first: the fewest hops from one node to another, or null. */
function route(graph: Graph, from: string, to: string): string[] | null {
  const parent = new Map<string, string | null>([[from, null]])
  const queue = [from]
  while (queue.length) {
    const node = queue.shift()!
    if (node === to) {
      const out = [node]
      for (let p = parent.get(node); p != null; p = parent.get(p)) out.unshift(p)
      return out
    }
    for (const next of graph.get(node) ?? [])
      if (!parent.has(next)) {
        parent.set(next, node)
        queue.push(next)
      }
  }
  return null
}

/** The holes a node reaches. */
function reach(graph: Graph, from: string): string[] {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length)
    for (const next of graph.get(queue.shift()!) ?? [])
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
  return [...seen].filter((n) => n.startsWith('h:')).map((n) => n.slice(2))
}

/** Each pin's design net; an unwired pin takes its in-part group's, else its own key. */
export function identities(layout: LayoutDetail, design: DesignDetail): (key: string) => string {
  const net = new Map<string, string>()
  for (const n of design.nets) for (const pin of n.pins) net.set(pin, n.name)
  const group = new Map<string, string[]>()
  for (const g of layout.joins) for (const key of g) group.set(key, g)
  return (key) =>
    net.get(key) ??
    group
      .get(key)
      ?.map((k) => net.get(k))
      .find(Boolean) ??
    (group.get(key)?.slice().sort()[0] || key)
}

function cellOf(at: string, cells: Map<string, Cell>): Cell {
  return cells.get(at) ?? { strip: 0, hole: 0 }
}

/** The path between two holes, what it goes through, and what that means. */
export function tracePath(
  layout: LayoutDetail,
  design: DesignDetail,
  a: Cell,
  b: Cell,
): PathResult {
  const graph = boardGraph(layout)
  const endA = endAt(layout, a)
  const endB = endAt(layout, b)
  const identity = identities(layout, design)
  const pinOf = (end: PathEnd) => end.pin ?? end.carries
  const netA = pinOf(endA) ? identity(pinOf(endA)!) : undefined
  const netB = pinOf(endB) ? identity(pinOf(endB)!) : undefined
  const cells = new Map<string, Cell>()
  for (let s = 1; s <= layout.strips; s++)
    for (let h = 1; h <= layout.holes; h++)
      cells.set(cellLabel({ strip: s, hole: h }), { strip: s, hole: h })
  cells.set(endA.at, a)
  cells.set(endB.at, b)

  const result: PathResult = {
    a: endA,
    b: endB,
    kind: 'apart',
    copper: [],
    jumpers: [],
    traces: [],
    inside: [],
    pins: [],
    holes: [],
    connectors: [],
    reachA: [],
    reachB: [],
    netA,
    netB,
    wiredA: design.nets.some((n) => n.name === netA),
    wiredB: design.nets.some((n) => n.name === netB),
  }
  const nodes = route(graph, nodeOf(endA), nodeOf(endB))
  if (!nodes) {
    result.kind = netA && netA === netB && result.wiredA ? 'missing' : 'apart'
    result.reachA = graph.has(nodeOf(endA)) ? reach(graph, nodeOf(endA)) : [endA.at]
    result.reachB = graph.has(nodeOf(endB)) ? reach(graph, nodeOf(endB)) : [endB.at]
    return result
  }
  result.kind = netA && netB ? (netA === netB ? 'same' : 'short') : 'joined'

  let stretch: Span | null = null
  nodes.forEach((node, i) => {
    const prev = nodes[i - 1]
    const next = nodes[i + 1]
    if (node.startsWith('h:')) {
      const at = node.slice(2)
      result.holes.push(at)
      if (prev?.startsWith('h:')) {
        const cell = cellOf(at, cells)
        if (stretch) stretch.to = cell
        else {
          stretch = { from: cellOf(prev.slice(2), cells), to: cell }
          result.copper.push(stretch)
        }
      } else stretch = null
      return
    }
    stretch = null
    const [kind, ...rest] = node.split(':')
    const id = Number(rest[0])
    const span = () => ({
      from: cellOf(prev?.slice(2) ?? '', cells),
      to: cellOf(next?.slice(2) ?? '', cells),
    })
    if (kind === 'j') result.jumpers.push({ id, ...span() })
    else if (kind === 't') result.traces.push({ id, ...span() })
    else if (kind === 'p') result.pins.push(node.slice(2))
    else if (kind === 'g' && prev && next)
      result.inside.push({ a: prev.slice(2), b: next.slice(2) })
    else if (kind === 'c' && !result.connectors.includes(rest[0])) result.connectors.push(rest[0])
  })
  return result
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One line saying what was found, and how it reads: fine, a short, or not joined. */
export function describePath(
  path: PathResult,
  boardType: LayoutDetail['board_type'],
): { text: string; tone: 'ok' | 'short' | 'open' } {
  const name = (end: PathEnd) =>
    end.pin
      ? `${end.pin} (${end.at})`
      : end.connector
        ? `${end.connector} (${end.at}, ${end.carries})`
        : end.at
  const via: string[] = []
  if (path.copper.length && boardType !== 'perfboard')
    via.push(plural(path.copper.length, boardType === 'stripboard' ? 'strip' : 'copper run'))
  if (path.traces.length) via.push(plural(path.traces.length, 'trace'))
  if (path.jumpers.length) via.push(plural(path.jumpers.length, 'jumper'))
  for (const ref of path.connectors) via.push(`through ${ref}`)
  for (const join of path.inside) via.push(`inside ${join.a.split('.')[0]}`)
  const route = via.join(', ') || 'the same hole'
  const net = (n: string | undefined, wired: boolean, pin?: string) =>
    wired ? n : `${pin} (not wired)`
  switch (path.kind) {
    case 'same':
    case 'joined':
      return { text: `${name(path.a)} → ${name(path.b)} · ${route}`, tone: 'ok' }
    case 'short':
      return {
        text: `Short: ${net(path.netA, path.wiredA, path.a.pin ?? path.a.carries)} and ${net(path.netB, path.wiredB, path.b.pin ?? path.b.carries)} meet through ${route}`,
        tone: 'short',
      }
    case 'missing':
      return { text: `Not connected yet (net ${path.netA})`, tone: 'open' }
    default:
      return {
        text: `${name(path.a)} and ${name(path.b)} aren't connected, and the design keeps them apart`,
        tone: 'open',
      }
  }
}
