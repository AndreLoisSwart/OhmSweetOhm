import { describe, expect, it } from 'vitest'
import type { DesignDetail } from '@/api/generated/model'
import { makeTracer } from './trace'

// A battery divider: bat.P → r_top → esp.ADC and r_bot → GND, with a filter cap on the
// ADC net (not series), and an LED resistor r_led from esp.LED to an unwired pin.
const part = (id: number, name: string, series: boolean, pins: [string, string][]) => ({
  id,
  name,
  series,
  pins: pins.map(([name, kind]) => ({ name, kind })),
})
const design = {
  parts: [
    part(1, 'Battery', false, [
      ['P', 'power_out'],
      ['N', 'ground'],
    ]),
    part(2, 'ESP32', false, [
      ['ADC', 'analog'],
      ['LED', 'gpio'],
      ['GND', 'ground'],
    ]),
    part(3, 'Resistor', true, [
      ['A', 'other'],
      ['B', 'other'],
    ]),
    part(4, 'Capacitor', false, [
      ['A', 'other'],
      ['B', 'other'],
    ]),
  ],
  placements: [
    { ref: 'bat', part_id: 1 },
    { ref: 'esp', part_id: 2 },
    { ref: 'r_top', part_id: 3 },
    { ref: 'r_bot', part_id: 3 },
    { ref: 'r_led', part_id: 3 },
    { ref: 'c', part_id: 4 },
  ],
  nets: [
    { name: 'P', pins: ['bat.P', 'r_top.A'] },
    { name: 'esp.ADC', pins: ['c.A', 'esp.ADC', 'r_bot.A', 'r_top.B'] },
    { name: 'GND', pins: ['bat.N', 'c.B', 'esp.GND', 'r_bot.B'] },
    { name: 'esp.LED', pins: ['esp.LED', 'r_led.A'] },
  ],
} as unknown as DesignDetail

const trace = makeTracer(design)

describe('trace through', () => {
  it('follows the whole chain and stops at ground with a tag', () => {
    const t = trace(['bat.P', 'r_top.A'])
    expect([...t.parts]).toEqual(['r_top', 'r_bot'])
    expect([...t.pins].sort()).toEqual(['c.A', 'esp.ADC', 'r_bot.A', 'r_bot.B', 'r_top.B'])
    expect(Object.fromEntries(t.ends)).toEqual({ 'r_bot.B': 'GND' })
    expect(t.hops.map((h) => [h.through, h.net, h.end])).toEqual([
      ['r_top', 'esp.ADC', false],
      ['r_bot', 'GND', true],
    ])
  })

  it('goes both ways from the middle, stopping at the supply too', () => {
    const t = trace(['c.A', 'esp.ADC', 'r_bot.A', 'r_top.B'])
    expect(Object.fromEntries(t.ends)).toEqual({ 'r_top.A': 'P', 'r_bot.B': 'GND' })
    expect(t.pins.has('bat.P')).toBe(false)
  })

  it("doesn't cross parts that aren't series, and ends at an unwired pin", () => {
    expect(trace(['bat.N', 'c.B', 'esp.GND', 'r_bot.B']).parts.has('c')).toBe(false)
    const t = trace(['esp.LED', 'r_led.A'])
    expect([...t.pins]).toEqual(['r_led.B'])
    expect(t.hops).toEqual([
      { through: 'r_led', part: 'Resistor', net: null, pins: ['r_led.B'], end: true },
    ])
  })

  it('does nothing in a design without series parts', () => {
    const plain = { ...design, parts: design.parts.map((p) => ({ ...p, series: false })) }
    expect(makeTracer(plain)(['bat.P', 'r_top.A']).pins.size).toBe(0)
  })
})
