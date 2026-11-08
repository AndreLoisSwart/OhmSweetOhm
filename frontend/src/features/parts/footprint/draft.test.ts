import { describe, expect, it } from 'vitest'
import type { PinOut } from '@/api/generated/model'
import { fromPart, onGrid, parse, toFootprintIn, withGenerated } from './draft'

const pin = (id: number, name: string, x: number | null = null, y: number | null = null) =>
  ({ id, name, x_mm: x, y_mm: y }) as PinOut

describe('footprint draft', () => {
  it('round-trips a saved footprint', () => {
    const draft = fromPart([pin(1, 'A', 0, 0), pin(2, 'B')], { x: -1, y: -1, w: 4.54, h: 2 })
    const parsed = parse(draft)
    expect(parsed.errors.size).toBe(0)
    expect(toFootprintIn(parsed)).toEqual({
      body_mm: { x: -1, y: -1, w: 4.54, h: 2 },
      holes: [{ pin_id: 1, x_mm: 0, y_mm: 0 }],
    })
  })

  it('flags half-entered holes, clashes and a bad outline', () => {
    const draft = fromPart([pin(1, 'A'), pin(2, 'B'), pin(3, 'C')], null)
    draft.holes[0] = { ...draft.holes[0], x: '1' }
    draft.holes[1] = { ...draft.holes[1], x: '2,54', y: '0' }
    draft.holes[2] = { ...draft.holes[2], x: '2.54', y: '0' }
    draft.body = { x: '0', y: '0', w: '0', h: '3' }
    const { errors, holes } = parse(draft)
    expect(errors.get(1)).toMatch(/both/)
    expect(errors.get(3)).toBe('Same hole as B')
    expect(errors.get('body')).toMatch(/more than 0/)
    expect(holes[0]).toMatchObject({ name: 'B', x: 2.54 })
  })

  it('takes a generated footprint', () => {
    const draft = fromPart([pin(1, 'A'), pin(2, 'B')], null)
    const next = withGenerated(draft, {
      body_mm: { x: -1.27, y: -1.27, w: 2.54, h: 5.08 },
      holes: [
        { pin_id: 1, pin: 'A', x_mm: 0, y_mm: 0 },
        { pin_id: 2, pin: 'B', x_mm: 0, y_mm: 2.54 },
      ],
    })
    expect(next.holes.map((h) => [h.x, h.y])).toEqual([
      ['0', '0'],
      ['0', '2.54'],
    ])
    expect(next.body.h).toBe('5.08')
    // An outline already entered stays.
    const kept = withGenerated(
      { ...draft, body: { x: '-3', y: '-3', w: '9', h: '9' } },
      {
        body_mm: { x: 0, y: 0, w: 1, h: 1 },
        holes: [],
      },
    )
    expect(kept.body.w).toBe('9')
    // …unless the new holes fall outside it: then it's replaced.
    const tooSmall = withGenerated(
      { ...draft, body: { x: '-1', y: '-1', w: '2', h: '2' } },
      {
        body_mm: { x: -1.27, y: -1.27, w: 2.54, h: 5.08 },
        holes: [
          { pin_id: 1, pin: 'A', x_mm: 0, y_mm: 0 },
          { pin_id: 2, pin: 'B', x_mm: 0, y_mm: 2.54 },
        ],
      },
    )
    expect(tooSmall.body.h).toBe('5.08')
  })

  it('knows the 2.54 mm grid', () => {
    const origin = { x: 0, y: 0 }
    expect(onGrid(22.86, 35.56, origin)).toBe(true)
    expect(onGrid(6.5, 0, origin)).toBe(false)
    expect(onGrid(3.54, 1, { x: 1, y: 1 })).toBe(true)
  })
})
