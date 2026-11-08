import { describe, expect, it } from 'vitest'
import type { PinOut } from '@/api/generated/model'
import {
  type BoardView,
  cellAt,
  cellLabel,
  footprintOffsets,
  holeX,
  MARGIN,
  netColor,
  STEP,
  stripLabel,
  stripY,
} from './geometry'

const top: BoardView = { strips: 24, holes: 37, flipped: false }
const bottom: BoardView = { ...top, flipped: true }

describe('board geometry', () => {
  it('labels strips like the board', () => {
    expect(stripLabel(1)).toBe('A')
    expect(stripLabel(24)).toBe('X')
    expect(stripLabel(27)).toBe('AA')
    expect(cellLabel({ strip: 3, hole: 14 })).toBe('C14')
  })

  it('mirrors the bottom view left to right, keeping each hole', () => {
    expect(holeX(1, top)).toBe(MARGIN + STEP / 2)
    expect(holeX(37, bottom)).toBe(MARGIN + STEP / 2)
    expect(holeX(1, bottom)).toBe(holeX(37, top))
    for (const view of [top, bottom]) {
      const cell = { strip: 5, hole: 12 }
      expect(cellAt(holeX(cell.hole, view) + 5, stripY(cell.strip) - 5, view)).toEqual(cell)
    }
  })

  it('turns footprints as the backend does', () => {
    const pins = [
      { name: 'A', x_mm: 0, y_mm: 0 },
      { name: 'K', x_mm: 2.54, y_mm: 0 },
      { name: 'X', x_mm: 6.5, y_mm: 0 },
      { name: 'N', x_mm: null, y_mm: null },
    ] as PinOut[]
    expect(footprintOffsets(pins, 0)).toEqual([
      { name: 'A', strip: 0, hole: 0 },
      { name: 'K', strip: 0, hole: 1 },
    ])
    // A quarter turn clockwise: along the strip becomes across them.
    expect(footprintOffsets(pins, 90)[1]).toEqual({ name: 'K', strip: 1, hole: -0 })
  })

  it('tints ground, supplies and other nets', () => {
    expect(netColor('GND')).toBe(netColor('GND_2'))
    expect(netColor('3V3')).toBe(netColor('5V'))
    expect(netColor('3V3')).not.toBe(netColor('GND'))
    expect(netColor('bme.SDA')).toBe(netColor('bme.SDA'))
  })
})
