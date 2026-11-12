import { describe, expect, it } from 'vitest'
import { labelSize, placeLabels } from './labels'
import type { Point, Rect } from './routing'

const box = (at: Point, text: string): Rect => {
  const { width, height } = labelSize(text)
  return { x: at.x - width / 2, y: at.y - height / 2, width, height }
}
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('placeLabels', () => {
  it('puts a lone label in the middle of its wire', () => {
    const routes = new Map([
      [
        'w',
        [
          { x: 0, y: 100 },
          { x: 400, y: 100 },
        ],
      ],
    ])
    expect(placeLabels(routes, [{ id: 'w', text: 'SDA' }], []).get('w')).toEqual({ x: 200, y: 100 })
  })

  it('slides labels on neighbouring wires apart', () => {
    const routes = new Map([
      [
        'p',
        [
          { x: 0, y: 100 },
          { x: 400, y: 100 },
        ],
      ],
      [
        'q',
        [
          { x: 0, y: 110 },
          { x: 400, y: 110 },
        ],
      ],
    ])
    const placed = placeLabels(
      routes,
      [
        { id: 'p', text: '5V rail' },
        { id: 'q', text: '5V rail (fused)' },
      ],
      [],
    )
    expect(placed.get('p')!.y).toBe(100)
    expect(placed.get('q')!.y).toBe(110)
    expect(
      overlaps(box(placed.get('p')!, '5V rail'), box(placed.get('q')!, '5V rail (fused)')),
    ).toBe(false)
  })

  it('labels a wire on its own branch, not the trunk it shares', () => {
    // p and q share the run along y = 100, then q branches down to y = 300.
    const routes = new Map([
      [
        'p',
        [
          { x: 0, y: 100 },
          { x: 400, y: 100 },
        ],
      ],
      [
        'q',
        [
          { x: 0, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 300 },
          { x: 400, y: 300 },
        ],
      ],
    ])
    const at = placeLabels(routes, [{ id: 'q', text: 'Radar 5V' }], []).get('q')!
    expect(at.y).toBeGreaterThan(100)
  })

  it('keeps off cards', () => {
    const routes = new Map([
      [
        'w',
        [
          { x: 0, y: 100 },
          { x: 400, y: 100 },
        ],
      ],
    ])
    const card = { x: 150, y: 80, width: 100, height: 60 } // over the middle
    const at = placeLabels(routes, [{ id: 'w', text: 'SCL' }], [card]).get('w')!
    expect(overlaps(box(at, 'SCL'), card)).toBe(false)
  })

  it('leaves out wires with no route', () => {
    expect(placeLabels(new Map(), [{ id: 'w', text: 'x' }], []).size).toBe(0)
  })
})
