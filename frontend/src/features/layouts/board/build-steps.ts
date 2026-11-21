// Build order on the board (build step 24): stepping through the design's build order,
// with each jumper, trace and connector in the step the server worked out for it
// (layouts/build_order.py). Pure, so it can be tested.
import type { DesignDetail, LayoutDetail } from '@/api/generated/model'
import { cellLabel } from './geometry'
import { boardGraph, identities } from './path'

/** 0 prepares the board; then the design's numbers; null for parts not ordered. */
export type StepValue = number | null

export interface BoardStep {
  value: StepValue
  /** Its parts' refs; for step 0, none. */
  refs: string[]
  /** What it's for, in a word or two. */
  label: string
}

/** Not ordered comes after every number. */
export const rank = (value: StepValue | undefined) => value ?? Infinity

export const PREPARE = 0

/** The board's steps in order, from the API, with the parts each brings. */
export function boardSteps(layout: LayoutDetail, design: DesignDetail): BoardStep[] {
  return layout.build_steps.map((value) => {
    if (value === PREPARE) {
      const links = layout.jumpers.filter((j) => j.step === PREPARE).length
      const what = [
        layout.cuts.length ? `${layout.cuts.length} cut${layout.cuts.length === 1 ? '' : 's'}` : '',
        links ? `${links} bottom link${links === 1 ? '' : 's'}` : '',
      ].filter(Boolean)
      return { value, refs: what, label: 'Prepare the board' }
    }
    const refs = design.placements
      .filter((p) => (p.build_step ?? null) === value)
      .map((p) => p.ref)
      .sort((a, b) => a.localeCompare(b))
    return { value, refs, label: value === null ? 'Not ordered' : `Step ${value}` }
  })
}

/** Which step to show for a wanted value: it, else the next one after it, else the last. */
export function stepIndex(steps: BoardStep[], value: StepValue): number {
  const at = steps.findIndex((s) => rank(s.value) >= rank(value))
  return at === -1 ? steps.length - 1 : at
}

export type Level = 'normal' | 'dim' | 'faded'

/** How each thing on the board is drawn at a step: as it is, greyed, or ghosted. */
export interface BoardShading {
  part: (placementId: number) => Level
  jumper: (id: number) => Level
  trace: (id: number) => Level
  connector: (id: number) => Level
}

export function boardShading(
  layout: LayoutDetail,
  design: DesignDetail,
  value: StepValue,
): BoardShading {
  const current = rank(value)
  const level = (step: StepValue | undefined): Level =>
    rank(step) === current ? 'normal' : rank(step) < current ? 'dim' : 'faded'
  const partStep = new Map(design.placements.map((p) => [p.id, p.build_step ?? null]))
  const stepOf = <T extends { id: number; step?: number | null }>(items: T[]) =>
    new Map(items.map((i) => [i.id, i.step ?? null]))
  const jumpers = stepOf(layout.jumpers)
  const traces = stepOf(layout.traces)
  const connectors = stepOf(layout.connectors)
  return {
    part: (id) => level(partStep.get(id)),
    jumper: (id) => level(jumpers.get(id)),
    trace: (id) => level(traces.get(id)),
    connector: (id) => level(connectors.get(id)),
  }
}

/**
 * The copper's tints from what's joined by a step: each run carries the design nets of
 * the pins it reaches, and is a short when it reaches two different nets (unwired pins
 * count), as the server works it out for the finished board.
 */
function tints(layout: LayoutDetail, design: DesignDetail): LayoutDetail['segments'] {
  const graph = boardGraph(layout)
  const identity = identities(layout, design)
  const netNames = new Set(design.nets.map((n) => n.name))
  // Each node's connected group, found once.
  const group = new Map<string, number>()
  const pinsOf: string[][] = []
  for (const start of graph.keys()) {
    if (group.has(start)) continue
    const id = pinsOf.length
    const pins: string[] = []
    const queue = [start]
    group.set(start, id)
    while (queue.length) {
      const node = queue.shift()!
      if (node.startsWith('p:')) pins.push(node.slice(2))
      for (const next of graph.get(node) ?? [])
        if (!group.has(next)) {
          group.set(next, id)
          queue.push(next)
        }
    }
    pinsOf.push(pins)
  }
  return layout.segments.map((s) => {
    const id = group.get(`h:${cellLabel({ strip: s.a_strip, hole: s.a_hole })}`)
    const all = new Set((id === undefined ? [] : pinsOf[id]).map(identity))
    const nets = [...all].filter((n) => netNames.has(n)).sort()
    return { ...s, nets, short: all.size > 1 }
  })
}

/**
 * The board up to a step. The copper is tinted from what's joined by then, and the
 * ratsnest joins only pins that are in. With later steps hidden, their parts, jumpers,
 * traces and connectors are left out too, so path tracing goes only through what's
 * shown; ghosted, they stay (and are drawn faint).
 */
export function layoutAt(
  layout: LayoutDetail,
  design: DesignDetail,
  value: StepValue,
  keepLater: boolean,
): LayoutDetail {
  const current = rank(value)
  const inBy = (step: StepValue | undefined) => rank(step) <= current
  const present = new Set(
    design.placements.filter((p) => inBy(p.build_step ?? null)).map((p) => p.ref),
  )
  const refOf = (key: string) => key.split('.')[0]
  const presentIds = new Set(design.placements.filter((p) => present.has(p.ref)).map((p) => p.id))
  const hidden: LayoutDetail = {
    ...layout,
    parts: layout.parts.filter((p) => presentIds.has(p.placement_id)),
    jumpers: layout.jumpers.filter((j) => inBy(j.step)),
    traces: layout.traces.filter((t) => inBy(t.step)),
    connectors: layout.connectors
      .filter((c) => inBy(c.step))
      // A connector's pins for parts not in yet carry nothing so far.
      .map((c) => ({
        ...c,
        pins: c.pins.map((p) => (p.pin && !present.has(refOf(p.pin)) ? { ...p, pin: null } : p)),
      })),
    joins: layout.joins
      .map((g) => g.filter((key) => present.has(refOf(key))))
      .filter((g) => g.length > 1),
    links: layout.links.filter((l) => present.has(refOf(l.a)) && present.has(refOf(l.b))),
  }
  hidden.segments = tints(hidden, design)
  return keepLater ? { ...layout, segments: hidden.segments, links: hidden.links } : hidden
}
