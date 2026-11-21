import { describe, expect, it } from 'vitest'
import { middleOf, movedJumper, sameEnds, turnJumper } from './jumper-move'

// C3 → C7: along strip C.
const j = { a_strip: 3, a_hole: 3, b_strip: 3, b_hole: 7 }

describe('moving a jumper', () => {
  it('moves one end and leaves the other', () => {
    expect(movedJumper(j, 'a', { dStrip: 2, dHole: -1 })).toEqual({ ...j, a_strip: 5, a_hole: 2 })
    expect(movedJumper(j, 'b', { dStrip: 0, dHole: 3 })).toEqual({ ...j, b_hole: 10 })
  })

  it('moves the whole jumper', () => {
    expect(movedJumper(j, 'body', { dStrip: 1, dHole: 2 })).toEqual({
      a_strip: 4,
      a_hole: 5,
      b_strip: 4,
      b_hole: 9,
    })
  })

  it('finds the middle hole, towards the first end when the length is odd', () => {
    expect(middleOf(j)).toEqual({ strip: 3, hole: 5 })
    expect(middleOf({ a_strip: 1, a_hole: 1, b_strip: 4, b_hole: 1 })).toEqual({
      strip: 2,
      hole: 1,
    })
  })
})

describe('turning a jumper', () => {
  it('turns a quarter clockwise about the pivot, as seen from the top', () => {
    // About C5: C3 (left of it) goes above it, C7 below.
    expect(turnJumper(j, { strip: 3, hole: 5 }, 1, false)).toEqual({
      a_strip: 1,
      a_hole: 5,
      b_strip: 5,
      b_hole: 5,
    })
  })

  it('turns the other way round in the holes on the copper side, clockwise as seen', () => {
    expect(turnJumper(j, { strip: 3, hole: 5 }, 1, true)).toEqual({
      a_strip: 5,
      a_hole: 5,
      b_strip: 1,
      b_hole: 5,
    })
  })

  it('comes back after four turns', () => {
    expect(sameEnds(turnJumper(j, { strip: 9, hole: 2 }, 4, false), j)).toBe(true)
  })

  it('turns about the grabbed hole, then moves', () => {
    expect(movedJumper(j, 'body', { dStrip: 0, dHole: 1 }, 1, { strip: 3, hole: 3 })).toEqual({
      a_strip: 3,
      a_hole: 4,
      b_strip: 7,
      b_hole: 4,
    })
  })
})
