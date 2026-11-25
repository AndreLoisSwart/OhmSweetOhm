import { describe, expect, it } from 'vitest'
import { GRAB_LENGTH, grabZones, PIN_CLEAR } from './grab'
import type { Point } from './routing'

const p = (x: number, y: number): Point => ({ x, y })

describe('grab zones', () => {
  it('start clear of the pin and run GRAB_LENGTH along the wire, at both ends', () => {
    const routes = new Map([['1', [p(0, 0), p(200, 0)]]])
    const { a, b } = grabZones(routes, [{ id: '1', a: 'esp.GND', b: 'bme.GND' }]).get('1')!
    expect(a).toEqual([p(PIN_CLEAR, 0), p(PIN_CLEAR + GRAB_LENGTH, 0)])
    expect(b).toEqual([p(200 - PIN_CLEAR, 0), p(200 - PIN_CLEAR - GRAB_LENGTH, 0)])
  })

  it('follow corners', () => {
    const routes = new Map([['1', [p(0, 0), p(20, 0), p(20, 100)]]])
    const { a } = grabZones(routes, [{ id: '1', a: 'x.A', b: 'y.B' }]).get('1')!
    expect(a).toEqual([p(PIN_CLEAR, 0), p(20, 0), p(20, PIN_CLEAR + GRAB_LENGTH - 20)])
  })

  it("start where a wire leaves the others on its pin, so each wire's branch picks it", () => {
    // Two wires leave esp.3V3 together for 20 px, then part: up and down.
    const routes = new Map([
      ['1', [p(0, 0), p(20, 0), p(20, -100), p(200, -100)]],
      ['2', [p(0, 0), p(20, 0), p(20, 100), p(200, 100)]],
    ])
    const zones = grabZones(routes, [
      { id: '1', a: 'esp.3V3', b: 'bme.VIN' },
      { id: '2', a: 'ESP.3v3', b: 'oled.VCC' }, // pins match ignoring case
    ])
    expect(zones.get('1')!.a).toEqual([p(20, 0), p(20, -GRAB_LENGTH)])
    expect(zones.get('2')!.a).toEqual([p(20, 0), p(20, GRAB_LENGTH)])
    // Their other ends are on pins of their own.
    expect(zones.get('1')!.b![0]).toEqual(p(200 - PIN_CLEAR, -100))
  })

  it('go to the latest wire, next to the pin, when wires share most of the way', () => {
    // 1 and 2 leave pin x.P together and only part 100 px out: neither branch is near the
    // pin, so the later wire (2) gets the zone by the pin and 1 has none at that end.
    const routes = new Map([
      ['1', [p(0, 0), p(100, 0), p(100, 50)]],
      ['2', [p(0, 0), p(200, 0)]],
    ])
    const zones = grabZones(routes, [
      { id: '1', a: 'x.P', b: 'y.Q' },
      { id: '2', a: 'x.P', b: 'z.R' },
    ])
    expect(zones.get('2')!.a).toEqual([p(PIN_CLEAR, 0), p(PIN_CLEAR + GRAB_LENGTH, 0)])
    expect(zones.get('1')!.a).toBeNull()
    expect(zones.get('1')!.b).not.toBeNull()
  })

  it("keep a short wire's two zones apart, and skip wires too short for any", () => {
    const routes = new Map([
      ['short', [p(0, 0), p(40, 0)]],
      ['tiny', [p(0, 0), p(10, 0)]],
    ])
    const zones = grabZones(routes, [
      { id: 'short', a: 'a.X', b: 'b.X' },
      { id: 'tiny', a: 'c.X', b: 'd.X' },
    ])
    const { a, b } = zones.get('short')!
    expect(a!.at(-1)!.x).toBeLessThanOrEqual(b!.at(-1)!.x)
    expect(zones.get('tiny')).toEqual({ a: null, b: null })
  })

  it('leave out wires with no route', () => {
    expect(grabZones(new Map(), [{ id: '1', a: 'a.X', b: 'b.X' }]).size).toBe(0)
  })
})
