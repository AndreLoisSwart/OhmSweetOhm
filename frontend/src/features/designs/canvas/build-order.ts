// Build order (docs/data-model.md): the design's parts in steps, to build and wire one
// step at a time. Pure, so it can be tested; the bar is build-order-bar.tsx.
import type { DesignDetail, PlacementOut } from '@/api/generated/model'
import type { FocusLevel, Shading } from './focus'

/** A step's number, or null for the parts not ordered yet. */
export type StepValue = number | null

export interface BuildStep {
  value: StepValue
  /** Its parts, by node id (placement id), and their refs. */
  ids: string[]
  refs: string[]
}

/** Not ordered comes after every number. */
const rank = (value: StepValue) => value ?? Infinity

/**
 * The steps in order: each number in use, then the parts not ordered (when some are).
 * Empty when no part is ordered yet.
 */
export function buildSteps(design: DesignDetail): BuildStep[] {
  if (!design.placements.some((p) => p.build_step != null)) return []
  const byValue = new Map<StepValue, PlacementOut[]>()
  for (const p of design.placements) {
    const value = p.build_step ?? null
    byValue.set(value, [...(byValue.get(value) ?? []), p])
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([value, parts]) => {
      const sorted = [...parts].sort((a, b) => a.ref.localeCompare(b.ref))
      return { value, ids: sorted.map((p) => String(p.id)), refs: sorted.map((p) => p.ref) }
    })
}

/** Which step to show for a wanted value: it, else the next one after it, else the last. */
export function stepIndex(steps: BuildStep[], value: StepValue): number {
  const at = steps.findIndex((s) => rank(s.value) >= rank(value))
  return at === -1 ? steps.length - 1 : at
}

function stepsById(design: DesignDetail): Map<string, number> {
  return new Map(design.placements.map((p) => [String(p.id), rank(p.build_step ?? null)]))
}

/**
 * At a step: its parts, and the wires they bring, as they are; earlier steps greyed;
 * later ones faded (when ghosted; hidden ones aren't drawn at all). A wire belongs to the
 * later of its two parts' steps.
 */
export function stepShading(design: DesignDetail, value: StepValue): Shading {
  const steps = stepsById(design)
  const current = rank(value)
  const level = (step: number): FocusLevel =>
    step === current ? 'normal' : step < current ? 'dim' : 'faded'
  const of = (id: string) => steps.get(id) ?? Infinity
  return {
    card: (id) => level(of(id)),
    wire: (source, target) => level(Math.max(of(source), of(target))),
  }
}

/** The design up to a step: later parts and their wires left out, so routes ignore them. */
export function shownAt(design: DesignDetail, value: StepValue): DesignDetail {
  const current = rank(value)
  const placements = design.placements.filter((p) => rank(p.build_step ?? null) <= current)
  if (placements.length === design.placements.length) return design
  const shown = new Set(placements.map((p) => p.id))
  return {
    ...design,
    placements,
    wires: design.wires.filter((w) => shown.has(w.a_placement_id) && shown.has(w.b_placement_id)),
  }
}

/**
 * Numbering by clicks: each click starts the next step; Shift-click adds the part to the
 * step just made (the first click of all is step 1 either way).
 */
export function numberClick(last: number, shift: boolean): number {
  return shift ? Math.max(last, 1) : last + 1
}
