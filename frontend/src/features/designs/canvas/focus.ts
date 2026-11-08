// Focus: show only the chosen parts and the wires between them, to read a busy design.
// Pure, so it can be tested; the canvas shares the current focus through FocusContext.
import { createContext } from 'react'
import type { DesignDetail } from '@/api/generated/model'

/** How strongly a card, wire or junction is drawn while focusing. */
export type FocusLevel = 'normal' | 'dim' | 'faded'

export interface Focus {
  /** The focused placements, by node id. */
  nodes: Set<string>
  /** Placements wired to a focused one (but not focused themselves): drawn greyed. */
  linked: Set<string>
}

/** The current focus, or null when there is none. */
export const FocusContext = createContext<Focus | null>(null)

export function focusOf(design: DesignDetail, ids: Iterable<string>): Focus | null {
  const present = new Set(design.placements.map((p) => String(p.id)))
  const nodes = new Set([...ids].filter((id) => present.has(id)))
  if (!nodes.size) return null
  const linked = new Set<string>()
  for (const wire of design.wires) {
    const [a, b] = [String(wire.a_placement_id), String(wire.b_placement_id)]
    if (nodes.has(a) && !nodes.has(b)) linked.add(b)
    if (nodes.has(b) && !nodes.has(a)) linked.add(a)
  }
  return { nodes, linked }
}

export function cardLevel(focus: Focus | null, id: string): FocusLevel {
  if (!focus || focus.nodes.has(id)) return 'normal'
  return focus.linked.has(id) ? 'dim' : 'faded'
}

/** Between focused parts: normal. From a focused part to another: greyed. Else faded. */
export function wireLevel(focus: Focus | null, source: string, target: string): FocusLevel {
  if (!focus) return 'normal'
  const ends = Number(focus.nodes.has(source)) + Number(focus.nodes.has(target))
  return ends === 2 ? 'normal' : ends === 1 ? 'dim' : 'faded'
}

const RANK: Record<FocusLevel, number> = { faded: 0, dim: 1, normal: 2 }

/** The strongest level among the wires on each net: a junction is drawn like its net. */
export function netLevels(
  focus: Focus | null,
  design: DesignDetail,
  netOf: (pinKey: string) => string | undefined,
): Map<string, FocusLevel> {
  const levels = new Map<string, FocusLevel>()
  for (const wire of design.wires) {
    const net = netOf(wire.a)
    if (!net) continue
    const level = wireLevel(focus, String(wire.a_placement_id), String(wire.b_placement_id))
    const known = levels.get(net)
    if (!known || RANK[level] > RANK[known]) levels.set(net, level)
  }
  return levels
}

/** The CSS class for a level (canvas.css). */
export const focusClass = (level: FocusLevel) =>
  level === 'dim' ? 'focus-dim' : level === 'faded' ? 'focus-faded' : undefined
