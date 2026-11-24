import { describe, expect, it } from 'vitest'
import { overlap, placeLabels } from './labels'

const bounds = { x: 0, y: 0, w: 100, h: 100 }

describe('placeLabels', () => {
  it('puts a label above what it names when that is free', () => {
    const around = { x: 20, y: 20, w: 30, h: 10 }
    const out = placeLabels([{ key: 'esp', text: 'esp', size: 2, around }], [], bounds)
    const spot = out.get('esp')!.rect
    expect(spot.y + spot.h).toBeLessThanOrEqual(around.y)
    expect(spot.x).toBe(20)
  })

  it('moves off a neighbouring body and its own edge of the board', () => {
    const around = { x: 20, y: 1, w: 30, h: 10 }
    // Above runs off the board; below is another part.
    const other = { x: 15, y: 11, w: 40, h: 20 }
    const out = placeLabels(
      [{ key: 'r1', text: 'r1', size: 2, around }],
      [
        { rect: around, owner: 'r1' },
        { rect: other, owner: 'c1' },
      ],
      bounds,
    )
    const spot = out.get('r1')!.rect
    expect(overlap(spot, other)).toBe(0)
    expect(overlap(spot, bounds)).toBeCloseTo(spot.w * spot.h)
  })

  it('keeps two labels apart', () => {
    const around = { x: 20, y: 20, w: 10, h: 10 }
    const out = placeLabels(
      [
        { key: 'a', text: 'J_LONG', size: 2, around },
        { key: 'b', text: 'J_LONG', size: 2, around },
      ],
      [],
      bounds,
    )
    expect(overlap(out.get('a')!.rect, out.get('b')!.rect)).toBe(0)
  })
})
