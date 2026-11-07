import { describe, expect, it } from 'vitest'
import { daysAsWeeks, durationSince } from './format'

const DAY = 86_400_000
const now = Date.UTC(2026, 10, 4, 12)
const ago = (days: number) => new Date(now - days * DAY).toISOString()

describe('durationSince', () => {
  it('counts days, then weeks, then months', () => {
    expect(durationSince(ago(1), now)).toBe('1 day')
    expect(durationSince(ago(13), now)).toBe('13 days')
    expect(durationSince(ago(14), now)).toBe('2 weeks')
    expect(durationSince(ago(45), now)).toBe('6 weeks')
    expect(durationSince(ago(84), now)).toBe('2 months')
    expect(durationSince(ago(200), now)).toBe('6 months')
  })
})

describe('daysAsWeeks', () => {
  it('uses weeks when they fit', () => {
    expect(daysAsWeeks(7)).toBe('1 week')
    expect(daysAsWeeks(21)).toBe('3 weeks')
    expect(daysAsWeeks(10)).toBe('10 days')
  })
})
