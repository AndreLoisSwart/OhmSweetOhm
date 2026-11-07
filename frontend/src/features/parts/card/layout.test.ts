import { describe, expect, it } from 'vitest'
import { GRID, layoutCard, rotateSide } from './layout'
import { BME280, ESP32_DEVKIT_V1 } from './sample-parts'

describe('rotateSide', () => {
  it('turns sides clockwise, flipping the order where reading direction reverses', () => {
    expect(rotateSide('left', 90)).toEqual({ side: 'top', reversed: true })
    expect(rotateSide('top', 90)).toEqual({ side: 'right', reversed: false })
    expect(rotateSide('right', 90)).toEqual({ side: 'bottom', reversed: true })
    expect(rotateSide('bottom', 90)).toEqual({ side: 'left', reversed: false })
    expect(rotateSide('left', 180)).toEqual({ side: 'right', reversed: true })
  })

  it('comes back to where it started after a full turn', () => {
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(rotateSide(side, 0)).toEqual({ side, reversed: false })
      const three = rotateSide(side, 270)
      expect(rotateSide(three.side, 90).side).toBe(side)
    }
  })
})

describe('layoutCard', () => {
  const at = (layout: ReturnType<typeof layoutCard>, name: string) =>
    layout.slots.find((s) => s.pin.name === name)!

  it('puts every pin and card edge on the grid, at every rotation', () => {
    for (const part of [ESP32_DEVKIT_V1, BME280]) {
      for (const rotation of [0, 90, 180, 270] as const) {
        const layout = layoutCard(part, rotation)
        expect(layout.width % GRID).toBe(0)
        expect(layout.height % GRID).toBe(0)
        expect(layout.slots).toHaveLength(part.pins.length)
        for (const s of layout.slots) {
          expect(s.x % GRID).toBe(0)
          expect(s.y % GRID).toBe(0)
        }
      }
    }
  })

  it('lays the ESP32 out in header order, 15 pins a side', () => {
    const layout = layoutCard(ESP32_DEVKIT_V1, 0)
    expect(at(layout, 'EN')).toMatchObject({ side: 'left', x: 0 })
    expect(at(layout, 'VIN').y).toBeGreaterThan(at(layout, 'EN').y)
    expect(at(layout, '3V3')).toMatchObject({ side: 'right', x: layout.width })
    expect(at(layout, 'EN').y).toBe(at(layout, 'GPIO23').y)
  })

  it('keeps the physical pin order when rotated (labels stay upright)', () => {
    // Turned clockwise, the left header (EN at the top) runs along the top, EN at the right.
    const layout = layoutCard(ESP32_DEVKIT_V1, 90)
    expect(at(layout, 'EN')).toMatchObject({ side: 'top', y: 0 })
    expect(at(layout, 'EN').x).toBeGreaterThan(at(layout, 'VIN').x)
    expect(at(layout, 'GPIO23')).toMatchObject({ side: 'bottom', y: layout.height })
    expect(layout.width).toBeGreaterThan(layout.height)
  })
})
