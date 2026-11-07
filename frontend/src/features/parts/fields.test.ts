import { describe, expect, it } from 'vitest'
import { formatAddresses, parseAddresses, parseOptionalId, parseUrl, parseVolts } from './fields'

describe('I2C addresses', () => {
  it('reads hex and decimal, keeps order and drops repeats', () => {
    expect(parseAddresses('0x77, 118 0x77')).toEqual({ value: [0x77, 0x76] })
    expect(parseAddresses('')).toEqual({ value: [] })
    expect(formatAddresses([0x76, 0x8])).toBe('0x76, 0x08')
  })

  it('refuses what is not a 7-bit address', () => {
    expect(parseAddresses('0x80')).toHaveProperty('error')
    expect(parseAddresses('abc')).toHaveProperty('error')
  })
})

describe('other fields', () => {
  it('reads volts with or without a unit', () => {
    expect(parseVolts('3,3 V')).toEqual({ value: 3.3 })
    expect(parseVolts('')).toEqual({ value: null })
    expect(parseVolts('-5')).toHaveProperty('error')
  })

  it('reads ids and links', () => {
    expect(parseOptionalId('#42')).toEqual({ value: 42 })
    expect(parseOptionalId('4.2')).toHaveProperty('error')
    expect(parseUrl('javascript:alert(1)')).toHaveProperty('error')
    expect(parseUrl(' https://x.io ')).toEqual({ value: 'https://x.io' })
  })
})
