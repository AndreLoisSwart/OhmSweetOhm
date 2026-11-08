import { describe, expect, it } from 'vitest'
import type { DesignDetail } from '@/api/generated/model'
import { cardLevel, focusOf, netLevels, wireLevel } from './focus'

// Only what focus reads: placements and wires. esp is wired to bme and amp; amp to spk.
const design = {
  placements: [1, 2, 3, 4].map((id) => ({ id })),
  wires: [
    { a: 'esp.21', b: 'bme.SDA', a_placement_id: 1, b_placement_id: 2 },
    { a: 'esp.5V', b: 'amp.VCC', a_placement_id: 1, b_placement_id: 3 },
    { a: 'amp.OUT', b: 'spk.P', a_placement_id: 3, b_placement_id: 4 },
  ],
} as unknown as DesignDetail

describe('focus', () => {
  it('greys parts wired to the focus and fades the rest', () => {
    const focus = focusOf(design, ['1', '2'])!
    expect(cardLevel(focus, '1')).toBe('normal')
    expect(cardLevel(focus, '3')).toBe('dim')
    expect(cardLevel(focus, '4')).toBe('faded')
    expect(wireLevel(focus, '1', '2')).toBe('normal')
    expect(wireLevel(focus, '1', '3')).toBe('dim')
    expect(wireLevel(focus, '3', '4')).toBe('faded')
  })

  it('is off without parts, and drops parts no longer placed', () => {
    expect(focusOf(design, [])).toBeNull()
    expect(focusOf(design, ['99'])).toBeNull()
    expect(cardLevel(null, '4')).toBe('normal')
    expect([...focusOf(design, ['3', '99'])!.nodes]).toEqual(['3'])
  })

  it('draws each net like its strongest wire', () => {
    const net = (key: string) => ({ 'esp.21': 'SDA', 'esp.5V': 'VCC', 'amp.OUT': 'OUT' })[key]
    const levels = netLevels(focusOf(design, ['2']), design, net)
    expect(Object.fromEntries(levels)).toEqual({ SDA: 'dim', VCC: 'faded', OUT: 'faded' })
  })
})
