import { describe, expect, it } from 'vitest'
import type { CanvasPart, DesignDetail } from '@/api/generated/model'
import { BME280, ESP32_DEVKIT_V1 } from '@/features/parts/card/sample-parts'
import { buildEdges, buildNodes, freeSpot, netsByPin, routeInput, turned } from './model'

const canvasPart = (id: number, part: typeof BME280): CanvasPart => ({
  id,
  name: part.name,
  kind: 'board',
  logic_voltage: '3v3',
  verified: true,
  pins: part.pins.map((p, i) => ({ ...p, id: id * 100 + i, wokwi_name: null })),
})

const design: DesignDetail = {
  id: 1,
  name: 'Station',
  shelf_project_id: null,
  tags: [],
  part_count: 2,
  updated_at: '2026-11-07T12:00:00Z',
  created_at: '2026-11-07T12:00:00Z',
  description_md: '',
  parts: [canvasPart(1, ESP32_DEVKIT_V1), canvasPart(2, BME280)],
  placements: [
    { id: 10, ref: 'esp', part_id: 1, x: 0, y: 0, rotation: 0, note: '' },
    { id: 11, ref: 'bme', part_id: 2, x: 360, y: 60, rotation: 0, note: '' },
  ],
  wires: [
    {
      id: 5,
      a: 'esp.GPIO21',
      b: 'bme.SDA',
      a_placement_id: 10,
      a_pin_id: 0,
      b_placement_id: 11,
      b_pin_id: 0,
      color: 'blue',
      label: '',
    },
  ],
  nets: [{ name: 'bme.SDA', pins: ['bme.SDA', 'esp.GPIO21'] }],
  check_summary: { error: 0, warning: 0, note: 0 },
  checks: { design_id: 1, summary: { error: 0, warning: 0, note: 0 }, results: [] },
}

describe('canvas model', () => {
  it('makes nodes and edges, keeping the selection', () => {
    const nodes = buildNodes(design, [])
    expect(nodes.map((n) => [n.id, n.position.x, n.data.part.name])).toEqual([
      ['10', 0, 'ESP32 DevKit V1 (30-pin)'],
      ['11', 360, 'BME280 breakout'],
    ])
    const again = buildNodes(design, [{ ...nodes[1], selected: true }])
    expect(again.map((n) => n.selected)).toEqual([false, true])
    const [edge] = buildEdges(design, [])
    expect(edge).toMatchObject({
      source: '10',
      sourceHandle: 'GPIO21',
      target: '11',
      targetHandle: 'SDA',
    })
  })

  it('finds each pin’s net', () => {
    expect(netsByPin(design).get('esp.GPIO21')?.name).toBe('bme.SDA')
  })

  it('places wire ends on the pins, facing out of their sides', () => {
    const { cards, wires } = routeInput(design)
    expect(cards[0]).toMatchObject({ x: 0, y: 0, height: 360 })
    expect(wires[0].a).toMatchObject({ x: cards[0].width, side: 'right' })
    expect(wires[0].b).toMatchObject({ x: 360, side: 'left' })
  })

  it('turns a part about its centre', () => {
    const t = turned(design.placements[0], design.parts[0])
    expect(t.rotation).toBe(90)
    // Taller than wide becomes wider than tall; the centre stays put (to the grid).
    expect(t.x).toBeLessThan(0)
    expect(t.y).toBeGreaterThan(0)
  })
})

describe('freeSpot', () => {
  const cards = [{ x: 0, y: 0, width: 200, height: 360 }]
  it('keeps a clear spot', () => {
    expect(freeSpot(cards, { x: 400, y: 0 })).toEqual({ x: 400, y: 0 })
  })
  it('moves right of a card in the way, leaving a gap', () => {
    expect(freeSpot(cards, { x: 60, y: 100 })).toEqual({ x: 240, y: 100 })
  })
})
