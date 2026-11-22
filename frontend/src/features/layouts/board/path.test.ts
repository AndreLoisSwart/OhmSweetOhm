import { describe, expect, it } from 'vitest'
import type { DesignDetail, LayoutDetail } from '@/api/generated/model'
import { describePath, tracePath } from './path'

// A stripboard: strip A runs 1–10 whole; strip C is cut between 4 and 5.
const segments = [
  { a_strip: 1, a_hole: 1, b_strip: 1, b_hole: 10 },
  { a_strip: 3, a_hole: 1, b_strip: 3, b_hole: 4 },
  { a_strip: 3, a_hole: 5, b_strip: 3, b_hole: 10 },
  { a_strip: 5, a_hole: 1, b_strip: 5, b_hole: 10 },
]

function board(extra: Partial<LayoutDetail> = {}): LayoutDetail {
  return {
    board_type: 'stripboard',
    strips: 6,
    holes: 10,
    segments,
    jumpers: [],
    traces: [],
    connectors: [],
    joins: [],
    parts: [
      {
        pins: [
          { key: 'esp.SDA', at: 'A2', strip: 1, hole: 2 },
          { key: 'esp.GND', at: 'C2', strip: 3, hole: 2 },
          { key: 'esp.GND2', at: 'E2', strip: 5, hole: 2 },
        ],
      },
      {
        pins: [
          { key: 'bme.SDA', at: 'A8', strip: 1, hole: 8 },
          { key: 'bme.GND', at: 'C8', strip: 3, hole: 8 },
        ],
      },
    ],
    ...extra,
  } as unknown as LayoutDetail
}

const design = {
  nets: [
    { name: 'SDA', pins: ['esp.SDA', 'bme.SDA'] },
    { name: 'GND', pins: ['esp.GND', 'bme.GND'] },
  ],
} as unknown as DesignDetail

const at = (label: string) => ({ strip: label.charCodeAt(0) - 64, hole: Number(label.slice(1)) })

describe('tracePath', () => {
  it('follows a strip, only the stretch between the pins', () => {
    const path = tracePath(board(), design, at('A2'), at('A8'))
    expect(path.kind).toBe('same')
    expect(path.a.pin).toBe('esp.SDA')
    expect(path.copper).toEqual([{ from: at('A2'), to: at('A8') }])
    expect(path.holes).toEqual(['A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'])
    expect(describePath(path, 'stripboard')).toEqual({
      text: 'esp.SDA (A2) → bme.SDA (A8) · 1 strip',
      tone: 'ok',
    })
  })

  it('says what a missing connection still needs, and what each end reaches', () => {
    const path = tracePath(board(), design, at('C2'), at('C8'))
    expect(path.kind).toBe('missing')
    expect(path.reachA).toContain('C4')
    expect(path.reachA).not.toContain('C5')
    expect(describePath(path, 'stripboard').text).toBe('Not connected yet (net GND)')
  })

  it('crosses a jumper, entering and leaving where it touches', () => {
    const jumpers = [{ id: 7, touches: ['C3', 'C6'] }]
    const path = tracePath(board({ jumpers } as never), design, at('C2'), at('C8'))
    expect(path.kind).toBe('same')
    expect(path.jumpers).toEqual([{ id: 7, from: at('C3'), to: at('C6') }])
    expect(path.copper).toEqual([
      { from: at('C2'), to: at('C3') },
      { from: at('C6'), to: at('C8') },
    ])
    expect(describePath(path, 'stripboard').text).toContain('2 strips, 1 jumper')
  })

  it('shows a short in red, naming both nets', () => {
    // A bare link from A5 down to C5 joins SDA to GND.
    const jumpers = [{ id: 1, touches: ['A5', 'B5', 'C5'] }]
    const path = tracePath(board({ jumpers } as never), design, at('A2'), at('C8'))
    expect(path.kind).toBe('short')
    expect(describePath(path, 'stripboard')).toEqual({
      text: 'Short: SDA and GND meet through 2 strips, 1 jumper',
      tone: 'short',
    })
  })

  it('goes through pins joined inside a part', () => {
    const joins = [['esp.GND', 'esp.GND2']]
    const path = tracePath(board({ joins } as never), design, at('E2'), at('C3'))
    // C3 is a bare hole on esp.GND's copper: joined, with no net of its own to compare.
    expect(path.kind).toBe('joined')
    expect(path.inside).toEqual([{ a: 'esp.GND2', b: 'esp.GND' }])
    expect(describePath(path, 'stripboard').text).toContain('inside esp')
    // An unwired GND2 takes the net of the ground it's joined to inside the part.
    expect(tracePath(board({ joins } as never), design, at('E2'), at('C2')).kind).toBe('same')
  })

  it('follows perfboard traces, only the pads between entry and exit', () => {
    const perf = board({
      board_type: 'perfboard',
      segments: [],
      traces: [{ id: 3, touches: ['A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'] }],
    } as never)
    const path = tracePath(perf, design, at('A2'), at('A8'))
    expect(path.traces).toEqual([{ id: 3, from: at('A2'), to: at('A8') }])
    expect(describePath(path, 'perfboard').text).toBe('esp.SDA (A2) → bme.SDA (A8) · 1 trace')
  })

  it('treats two bare holes as joined or not, with no net to compare', () => {
    expect(tracePath(board(), design, at('A1'), at('A10')).kind).toBe('joined')
    const apart = tracePath(board(), design, at('A1'), at('E10'))
    expect(apart.kind).toBe('apart')
    expect(describePath(apart, 'stripboard').tone).toBe('open')
  })
})

describe('test points on the board', () => {
  // TP1 at A10 "carries" esp.SDA, which is on the board at A2: no cable, only copper.
  const tp = {
    connectors: [{ ref: 'TP1', pins: [{ index: 1, pin: 'esp.SDA', strip: 5, hole: 10 }] }],
  }
  it("doesn't jump from a test point to the pin it names", () => {
    // TP1 is on strip E, nowhere near A2: same net, but only copper could join them.
    const path = tracePath(board(tp as never), design, at('E10'), at('A2'))
    expect(path.a.connector).toBe('TP1 pin 1')
    expect(path.kind).toBe('missing')
    expect(describePath(path, 'stripboard').text).toBe('Not connected yet (net SDA)')
    // Joined to strip A by a jumper, the path runs through the copper.
    const jumpers = [{ id: 1, touches: ['A9', 'E9'] }]
    const joined = tracePath(board({ ...tp, jumpers } as never), design, at('E10'), at('A2'))
    expect(joined.kind).toBe('same')
    expect(describePath(joined, 'stripboard').text).toBe(
      'TP1 pin 1 (E10, esp.SDA) → esp.SDA (A2) · 2 strips, 1 jumper',
    )
  })
})
