import { describe, expect, it } from 'vitest'
import type { DesignDetail, LayoutDetail } from '@/api/generated/model'
import { boardShading, boardSteps, layoutAt, stepIndex } from './build-steps'

const design = {
  placements: [
    { id: 1, ref: 'a', build_step: 1 },
    { id: 2, ref: 'b', build_step: 2 },
    { id: 3, ref: 'c', build_step: null },
  ],
  nets: [
    { name: 'A', pins: ['a.A', 'b.A'] },
    { name: 'C', pins: ['c.A', 'b.K'] },
  ],
} as unknown as DesignDetail

// Strips A, B and C, holes 1–5: a's anode on A, b's anode on B and cathode on C, c's
// anode on C. Jumper 11 (step 2) joins A to B; jumper 12 (not ordered) B to C, a short.
const run = (strip: number) => ({ a_strip: strip, a_hole: 1, b_strip: strip, b_hole: 5 })
const layout = {
  board_type: 'stripboard',
  strips: 3,
  holes: 5,
  build_steps: [0, 1, 2, null],
  cuts: [{ id: 1 }, { id: 2 }],
  jumpers: [
    { id: 10, step: 0, touches: [] },
    { id: 11, step: 2, touches: ['A3', 'B3'] },
    { id: 12, step: null, touches: ['B4', 'C4'] },
  ],
  traces: [],
  connectors: [{ id: 20, step: null, pins: [] }],
  parts: [
    { placement_id: 1, pins: [{ key: 'a.A', at: 'A1', strip: 1, hole: 1 }] },
    {
      placement_id: 2,
      pins: [
        { key: 'b.A', at: 'B1', strip: 2, hole: 1 },
        { key: 'b.K', at: 'C1', strip: 3, hole: 1 },
      ],
    },
    { placement_id: 3, pins: [{ key: 'c.A', at: 'C5', strip: 3, hole: 5 }] },
  ],
  segments: [run(1), run(2), run(3)],
  links: [
    { a: 'a.A', b: 'b.A' },
    { a: 'b.K', b: 'c.A' },
  ],
  joins: [],
} as unknown as LayoutDetail

describe('board build steps', () => {
  it('lists the steps with what each brings', () => {
    expect(boardSteps(layout, design)).toEqual([
      { value: 0, refs: ['2 cuts', '1 bottom link'], label: 'Prepare the board' },
      { value: 1, refs: ['a'], label: 'Step 1' },
      { value: 2, refs: ['b'], label: 'Step 2' },
      { value: null, refs: ['c'], label: 'Not ordered' },
    ])
    expect(stepIndex(boardSteps(layout, design), 2)).toBe(2)
    expect(stepIndex(boardSteps(layout, design), 7)).toBe(3)
  })

  it('greys earlier steps and fades later ones', () => {
    const shade = boardShading(layout, design, 2)
    expect([shade.part(1), shade.part(2), shade.part(3)]).toEqual(['dim', 'normal', 'faded'])
    expect([shade.jumper(10), shade.jumper(11), shade.jumper(12)]).toEqual([
      'dim',
      'normal',
      'faded',
    ])
    expect(shade.connector(20)).toBe('faded')
  })

  it('shows the board as it is by a step', () => {
    const tint = (l: LayoutDetail) => l.segments.map((seg) => [seg.nets, seg.short])
    const one = layoutAt(layout, design, 1, false)
    expect(one.parts.map((p) => p.placement_id)).toEqual([1])
    expect(one.jumpers.map((j) => j.id)).toEqual([10])
    expect(one.connectors).toEqual([])
    // Only a is in: its strip carries net A, the others are bare.
    expect(tint(one)).toEqual([
      [['A'], false],
      [[], false],
      [[], false],
    ])
    // b isn't in, so a's anode has nothing to join yet.
    expect(one.links).toEqual([])
    const two = layoutAt(layout, design, 2, false)
    expect(tint(two)).toEqual([
      [['A'], false],
      [['A'], false],
      [['C'], false],
    ])
    // Ghosted, later things stay, but the tints still follow the step: jumper 12's short
    // isn't there yet.
    const ghosted = layoutAt(layout, design, 2, true)
    expect(ghosted.parts).toHaveLength(3)
    expect(ghosted.jumpers).toHaveLength(3)
    expect(ghosted.links).toEqual([{ a: 'a.A', b: 'b.A' }])
    expect(tint(ghosted)).toEqual(tint(two))
    // With everything in, jumper 12 shorts A to C.
    expect(tint(layoutAt(layout, design, null, false)).every(([, short]) => short)).toBe(true)
  })
})
