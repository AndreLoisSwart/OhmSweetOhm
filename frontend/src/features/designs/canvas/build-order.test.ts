import { describe, expect, it } from 'vitest'
import type { DesignDetail } from '@/api/generated/model'
import { buildSteps, numberClick, shownAt, stepIndex, stepShading } from './build-order'

// esp (1), oled and cap (3, sharing a step), btn not ordered.
const design = {
  placements: [
    { id: 1, ref: 'esp', build_step: 1 },
    { id: 2, ref: 'oled', build_step: 3 },
    { id: 3, ref: 'cap', build_step: 3 },
    { id: 4, ref: 'btn', build_step: null },
  ],
  wires: [
    { a_placement_id: 1, b_placement_id: 2 },
    { a_placement_id: 3, b_placement_id: 2 },
    { a_placement_id: 4, b_placement_id: 1 },
  ],
} as unknown as DesignDetail

describe('build order', () => {
  it('groups parts by number, gaps skipped, the unordered last', () => {
    expect(buildSteps(design)).toEqual([
      { value: 1, ids: ['1'], refs: ['esp'] },
      { value: 3, ids: ['3', '2'], refs: ['cap', 'oled'] },
      { value: null, ids: ['4'], refs: ['btn'] },
    ])
    const none = {
      ...design,
      placements: design.placements.map((p) => ({ ...p, build_step: null })),
    }
    expect(buildSteps(none)).toEqual([])
  })

  it('finds the step to show after numbers change', () => {
    const steps = buildSteps(design)
    expect(stepIndex(steps, 3)).toBe(1)
    expect(stepIndex(steps, 2)).toBe(1)
    expect(stepIndex(steps, 9)).toBe(2)
    expect(stepIndex(steps, null)).toBe(2)
  })

  it('draws the step as it is, earlier greyed, later faded; a wire goes with its later end', () => {
    const at = stepShading(design, 3)
    expect([at.card('2'), at.card('1'), at.card('4')]).toEqual(['normal', 'dim', 'faded'])
    expect(at.wire('1', '2')).toBe('normal')
    expect(at.wire('4', '1')).toBe('faded')
    expect(stepShading(design, 1).wire('1', '2')).toBe('faded')
  })

  it('leaves later parts and their wires out when hidden', () => {
    const shown = shownAt(design, 1)
    expect(shown.placements.map((p) => p.ref)).toEqual(['esp'])
    expect(shown.wires).toEqual([])
    expect(shownAt(design, 3).wires).toHaveLength(2)
    expect(shownAt(design, null)).toBe(design)
  })

  it('numbers by clicks', () => {
    expect(numberClick(0, false)).toBe(1)
    expect(numberClick(0, true)).toBe(1)
    expect(numberClick(2, false)).toBe(3)
    expect(numberClick(2, true)).toBe(2)
  })
})
