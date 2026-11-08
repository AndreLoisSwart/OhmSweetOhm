import { describe, expect, it } from 'vitest'
import type { LayoutDetail } from '@/api/generated/model'
import { type BoardView, holeX, STEP, stripY } from './geometry'
import { cutTarget, takenHoles } from './tools'

const top: BoardView = { strips: 24, holes: 37, flipped: false }
const bottom: BoardView = { ...top, flipped: true }

describe('board tools', () => {
  it('cuts at a hole, or between two near the gap', () => {
    const y = stripY(3)
    expect(cutTarget(holeX(10, top) + 2, y, top)).toEqual({ strip: 3, hole: 10, between: false })
    // Just right of hole 10 on screen: between 10 and 11.
    expect(cutTarget(holeX(10, top) + STEP * 0.45, y, top)).toEqual({
      strip: 3,
      hole: 10,
      between: true,
    })
    expect(cutTarget(holeX(10, top) - STEP * 0.45, y, top)).toEqual({
      strip: 3,
      hole: 9,
      between: true,
    })
    // Turned over, the right of hole 10 on screen is hole 9.
    expect(cutTarget(holeX(10, bottom) + STEP * 0.45, y, bottom)).toEqual({
      strip: 3,
      hole: 9,
      between: true,
    })
  })

  it('knows which holes are taken', () => {
    const layout = {
      parts: [{ pins: [{ key: 'led.A', at: 'C5' }] }],
      connectors: [{ ref: 'J1', pins: [{ index: 1, strip: 4, hole: 2 }] }],
      jumpers: [
        { side: 'top', a: 'A1', b: 'A9' },
        { side: 'bottom', a: 'B1', b: 'B9' },
      ],
    } as unknown as LayoutDetail
    const taken = takenHoles(layout)
    expect(taken.get('C5')).toBe('led.A')
    expect(taken.get('D2')).toBe('J1 pin 1')
    expect(taken.has('A9')).toBe(true)
    expect(taken.has('B1')).toBe(false)
  })
})
