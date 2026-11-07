import { describe, expect, it } from 'vitest'
import type { PinOut } from '@/api/generated/model'
import {
  fromPins,
  guessKind,
  newPin,
  parseNames,
  pinErrors,
  toPinsIn,
  withPositions,
} from './draft'

const out = (id: number, name: string, side: PinOut['side'], position: number): PinOut => ({
  id,
  name,
  kind: 'gpio',
  functions: [],
  voltage: null,
  flags: [],
  side,
  position,
  wokwi_name: null,
})

describe('drafts', () => {
  it('round-trips the API pins, grouped by side in order', () => {
    const pins = [out(3, 'B', 'right', 0), out(1, 'Y', 'left', 1), out(2, 'X', 'left', 0)]
    const sent = toPinsIn(fromPins(pins))
    expect(sent.map((p) => [p.id, p.name, p.side])).toEqual([
      [2, 'X', 'left'],
      [1, 'Y', 'left'],
      [3, 'B', 'right'],
    ])
  })

  it('leaves the id out for new pins and trims names', () => {
    const [sent] = toPinsIn([{ ...newPin(' VIN ', 'left'), wokwi_name: ' ' }])
    expect(sent).not.toHaveProperty('id')
    expect(sent.name).toBe('VIN')
    expect(sent.wokwi_name).toBeNull()
  })

  it('groups by side and renumbers positions from the list order', () => {
    const pins = withPositions([newPin('A', 'left'), newPin('B', 'right'), newPin('C', 'left')])
    expect(pins.map((p) => [p.name, p.side, p.position])).toEqual([
      ['A', 'left', 0],
      ['C', 'left', 1],
      ['B', 'right', 0],
    ])
  })
})

describe('pinErrors', () => {
  it('flags empty, badly formed and repeated names, ignoring case', () => {
    const pins = [
      newPin('', 'left'),
      newPin('GPIO 2', 'left'),
      newPin('esp.GND', 'left'),
      newPin('GND', 'left'),
      newPin('gnd', 'right'),
      newPin('VIN', 'left'),
    ]
    const errors = pinErrors(pins)
    expect(new Set(errors.keys())).toEqual(new Set(pins.slice(0, 5).map((p) => p.key)))
    expect(errors.get(pins[4].key)).toMatch(/GND2/)
  })

  it('checks voltages', () => {
    expect(pinErrors([{ ...newPin('VIN', 'left'), voltage: 0 }]).size).toBe(1)
    expect(pinErrors([{ ...newPin('VIN', 'left'), voltage: 3.3 }]).size).toBe(0)
  })
})

describe('guessKind', () => {
  it.each([
    ['GND', 'ground'],
    ['gnd2', 'ground'],
    ['3V3', 'power_in'],
    ['VIN', 'power_in'],
    ['SDA', 'i2c_sda'],
    ['SCL', 'i2c_scl'],
    ['MOSI', 'spi_mosi'],
    ['CS', 'spi_cs'],
    ['TX', 'uart_tx'],
    ['RXD', 'uart_rx'],
    ['EN', 'enable'],
    ['RST', 'reset'],
    ['A0', 'analog'],
    ['GPIO21', 'gpio'],
    ['D5', 'gpio'],
  ])('%s is %s', (name, kind) => expect(guessKind(name)).toBe(kind))
})

describe('parseNames', () => {
  it('splits on lines, commas and tabs, and joins words with underscores', () => {
    expect(parseNames('VIN\nGND, SCL\tSDA\n\n  INT 1 ')).toEqual([
      'VIN',
      'GND',
      'SCL',
      'SDA',
      'INT_1',
    ])
  })
})
