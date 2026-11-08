import { describe, expect, it } from 'vitest'
import { midpoint, type Point, type Rect, roundedPath, routeFor, routeWires } from './routing'

const A: Rect = { x: 0, y: 0, width: 200, height: 360 }
const B: Rect = { x: 400, y: 60, width: 120, height: 140 }

/** Whether a horizontal or vertical segment passes through a card's inside. */
function crosses(p: Point, q: Point, r: Rect): boolean {
  const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)]
  const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)]
  return x0 < r.x + r.width && x1 > r.x && y0 < r.y + r.height && y1 > r.y
}

const segments = (points: Point[]) => points.slice(1).map((q, i) => [points[i], q] as const)

describe('routeWires', () => {
  it('draws facing pins at the same height as one straight line', () => {
    const routes = routeWires(
      [A, B],
      [{ id: 'w', a: { x: 200, y: 110, side: 'right' }, b: { x: 400, y: 110, side: 'left' } }],
    )
    expect(routes.get('w')).toEqual([
      { x: 200, y: 110 },
      { x: 400, y: 110 },
    ])
  })

  it('goes around a card rather than through it', () => {
    // From A's left side to B's left side: the straight way crosses A.
    const routes = routeWires(
      [A, B],
      [{ id: 'w', a: { x: 0, y: 50, side: 'left' }, b: { x: 400, y: 110, side: 'left' } }],
    )
    const route = routes.get('w')!
    expect(route).toBeDefined()
    for (const [p, q] of segments(route.slice(1, -1))) {
      expect(crosses(p, q, A)).toBe(false)
      expect(crosses(p, q, B)).toBe(false)
    }
    expect(route[0]).toEqual({ x: 0, y: 50 })
    expect(route.at(-1)).toEqual({ x: 400, y: 110 })
  })

  it('spreads wires that would share a path onto separate tracks', () => {
    const wires = [50, 70, 90].map((y, i) => ({
      id: `w${i}`,
      a: { x: 200, y, side: 'right' as const },
      b: { x: 400, y: 190 - i * 20, side: 'left' as const },
    }))
    const routes = routeWires([A, B], wires)
    // Every wire turns down or up somewhere between the cards; no two on the same x.
    const verticals = [...routes.values()].flatMap((points) =>
      segments(points)
        .filter(([p, q]) => p.x === q.x && p.y !== q.y)
        .map(([p]) => p.x),
    )
    expect(routes.size).toBe(3)
    expect(new Set(verticals).size).toBe(verticals.length)
  })

  it("doesn't run through another pin's stub", () => {
    // Two pins one above the other on A's right side; the wire from the lower one must
    // not pass the upper one's stub end.
    const routes = routeWires(
      [A, B],
      [
        { id: 'low', a: { x: 200, y: 110, side: 'right' }, b: { x: 400, y: 90, side: 'left' } },
        { id: 'up', a: { x: 200, y: 90, side: 'right' }, b: { x: 400, y: 190, side: 'left' } },
      ],
    )
    const stubOfUpper = { x: 220, y: 90 }
    for (const [p, q] of segments(routes.get('low')!)) {
      const onIt =
        (p.x === q.x &&
          p.x === stubOfUpper.x &&
          Math.min(p.y, q.y) <= 90 &&
          Math.max(p.y, q.y) >= 90) ||
        (p.y === q.y &&
          p.y === stubOfUpper.y &&
          Math.min(p.x, q.x) <= 220 &&
          Math.max(p.x, q.x) >= 220)
      expect(onIt).toBe(false)
    }
  })
})

describe('path helpers', () => {
  it('rounds corners and finds the middle', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(roundedPath(points)).toBe('M 0 0 L 94 0 Q 100 0 100 6 L 100 100')
    expect(midpoint(points)).toEqual({ x: 100, y: 0 })
  })
})

describe('routeFor', () => {
  const route = [
    { x: 200, y: 110 },
    { x: 300, y: 110 },
    { x: 300, y: 210 },
    { x: 400, y: 210 },
  ]

  it('draws the route as computed, not from the measured handle ends', () => {
    // React Flow's ends a few pixels off (a left/right handle's edge, or a re-measure).
    expect(routeFor(route, { x: 205, y: 113 }, { x: 395, y: 207 })).toBe(route)
  })

  it('gives up on a route that no longer meets the pins', () => {
    // The card at the far end is being dragged and isn't saved yet.
    expect(routeFor(route, { x: 200, y: 110 }, { x: 420, y: 230 })).toBeNull()
    expect(routeFor(undefined, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull()
  })
})
