// The footprint editor's working copy (build step 14): text fields as typed, so a value
// can be half-entered, and the rules, testable without React. All lengths in mm.
import type { BodyMm, FootprintIn, FootprintOut, PinOut } from '@/api/generated/model'

/** The distance between protoboard holes. */
export const PITCH_MM = 2.54

export interface DraftHole {
  pinId: number
  name: string
  x: string
  y: string
}

export interface FootprintDraft {
  holes: DraftHole[]
  /** x, y, w, h as typed; all blank means no body. */
  body: { x: string; y: string; w: string; h: string }
}

const text = (value: number | null | undefined) => (value == null ? '' : String(value))

export function fromPart(pins: PinOut[], body: BodyMm | null): FootprintDraft {
  return {
    holes: pins.map((p) => ({ pinId: p.id, name: p.name, x: text(p.x_mm), y: text(p.y_mm) })),
    body: { x: text(body?.x), y: text(body?.y), w: text(body?.w), h: text(body?.h) },
  }
}

/** Whether a hole is within an outline (on its edge counts). */
export const within = (hole: { x: number; y: number }, body: BodyMm) =>
  hole.x >= body.x - 0.01 &&
  hole.x <= body.x + body.w + 0.01 &&
  hole.y >= body.y - 0.01 &&
  hole.y <= body.y + body.h + 0.01

/**
 * A generated footprint over the draft: every pin gets its hole. An outline already
 * entered is kept when the new holes fit inside it (it's usually the real one);
 * otherwise, or with none, the one around the pins is used.
 */
export function withGenerated(draft: FootprintDraft, made: FootprintOut): FootprintDraft {
  const holes = new Map(made.holes.map((h) => [h.pin_id, h]))
  const entered = parse({ holes: [], body: draft.body }).body
  const keep =
    entered !== null && made.holes.every((h) => within({ x: h.x_mm, y: h.y_mm }, entered))
  return {
    holes: draft.holes.map((h) => {
      const made = holes.get(h.pinId)
      return made ? { ...h, x: String(made.x_mm), y: String(made.y_mm) } : h
    }),
    body: keep
      ? draft.body
      : made.body_mm
        ? {
            x: String(made.body_mm.x),
            y: String(made.body_mm.y),
            w: String(made.body_mm.w),
            h: String(made.body_mm.h),
          }
        : draft.body,
  }
}

const num = (value: string): number | null | 'bad' => {
  if (!value.trim()) return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && Math.abs(n) <= 500 ? Math.round(n * 100) / 100 : 'bad'
}

export interface Parsed {
  holes: { pinId: number; name: string; x: number; y: number }[]
  body: BodyMm | null
  /** By pin id, or "body". */
  errors: Map<number | 'body', string>
}

export function parse(draft: FootprintDraft): Parsed {
  const errors: Parsed['errors'] = new Map()
  const holes: Parsed['holes'] = []
  const spots = new Map<string, string>()
  for (const hole of draft.holes) {
    const x = num(hole.x)
    const y = num(hole.y)
    if (x === 'bad' || y === 'bad') {
      errors.set(hole.pinId, 'Not a number of mm')
    } else if ((x === null) !== (y === null)) {
      errors.set(hole.pinId, 'Needs both x and y, or neither')
    } else if (x !== null && y !== null) {
      const spot = `${x},${y}`
      const other = spots.get(spot)
      if (other) errors.set(hole.pinId, `Same hole as ${other}`)
      spots.set(spot, hole.name)
      holes.push({ pinId: hole.pinId, name: hole.name, x, y })
    }
  }
  const b = draft.body
  const values = [num(b.x), num(b.y), num(b.w), num(b.h)]
  let body: BodyMm | null = null
  if (values.some((v) => v !== null)) {
    const [x, y, w, h] = values
    if (values.some((v) => v === null || v === 'bad')) {
      errors.set('body', 'The outline needs x, y, width and height in mm')
    } else if ((w as number) <= 0 || (h as number) <= 0) {
      errors.set('body', 'Width and height must be more than 0')
    } else {
      body = { x: x as number, y: y as number, w: w as number, h: h as number }
    }
  }
  return { holes, body, errors }
}

export function toFootprintIn(parsed: Parsed): FootprintIn {
  return {
    body_mm: parsed.body,
    holes: parsed.holes.map((h) => ({ pin_id: h.pinId, x_mm: h.x, y_mm: h.y })),
  }
}

/**
 * Whether a hole lands on the protoboard grid, measured from the first hole: a part
 * whose holes aren't 2.54 mm apart can't sit on a stripboard as it is.
 */
export function onGrid(x: number, y: number, origin: { x: number; y: number }): boolean {
  const off = (v: number) => {
    const steps = v / PITCH_MM
    return Math.abs(steps - Math.round(steps)) * PITCH_MM > 0.05
  }
  return !off(x - origin.x) && !off(y - origin.y)
}
