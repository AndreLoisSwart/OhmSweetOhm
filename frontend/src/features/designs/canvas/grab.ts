// Grab zones: the stretch of a wire next to each of its pins that can be dragged to move
// that end to another pin. The pin itself still starts a new wire, so the zone starts a
// little way out from it. Wires sharing a pin run on one track at first (routing.ts):
// each wire's zone starts where it leaves the others, so you pick a wire by its branch.
import type { Point } from './routing'

/** How long a grab zone is, in px along the wire. */
export const GRAB_LENGTH = 30
/** Left clear next to the pin, which starts new wires. */
export const PIN_CLEAR = 8
/** How far from its pin a wire may leave the others there and still be grabbed where it
 * leaves them. */
const MAX_SHARED = 40
/** The shortest zone worth drawing. */
const MIN_ZONE = 6
/** Sampling step when finding where a wire leaves the others on its pin. */
const SAMPLE = 2

/** A wire's ends as `ref.PIN`, by edge id. */
export interface WireEnds {
  id: string
  a: string
  b: string
}

/** Each end's grab zone as corner points, from the pin outwards; null if there's no room. */
export interface Grab {
  a: Point[] | null
  b: Point[] | null
}

const lengthOf = (path: Point[]) =>
  path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0)

/** The point `d` px along a path. */
function pointAt(path: Point[], d: number): Point {
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1], path[i]]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (d <= len) {
      const t = len ? d / len : 0
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
    }
    d -= len
  }
  return path.at(-1)!
}

/** The part of a path from `from` to `to` px along it. */
export function slice(path: Point[], from: number, to: number): Point[] {
  const out = [pointAt(path, from)]
  let d = 0
  for (let i = 1; i < path.length; i++) {
    d += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (d > from && d < to) out.push(path[i])
  }
  out.push(pointAt(path, to))
  return out
}

function onPath(p: Point, path: Point[], tolerance = 1): boolean {
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= tolerance) return true
  }
  return false
}

/** How far from the pin `own` runs on top of any of `others` (all starting at the pin). */
function sharedLength(own: Point[], others: Point[][]): number {
  if (!others.length) return 0
  const total = lengthOf(own)
  let d = 0
  while (d + SAMPLE <= total && others.some((o) => onPath(pointAt(own, d + SAMPLE), o))) d += SAMPLE
  return d
}

/**
 * Every routed wire's grab zones. A zone runs GRAB_LENGTH px from PIN_CLEAR out, or from
 * where the wire leaves other wires on the same pin, and stops at the wire's middle so a
 * short wire's two zones don't meet.
 */
export function grabZones(routes: Map<string, Point[]>, wires: WireEnds[]): Map<string, Grab> {
  // Each pin's routed wires, as paths starting at that pin.
  const atPin = new Map<string, { id: string; path: Point[] }[]>()
  const fromPin = (w: WireEnds, end: 'a' | 'b') => {
    const route = routes.get(w.id)!
    return end === 'a' ? route : [...route].reverse()
  }
  for (const w of wires) {
    if (!routes.has(w.id)) continue
    for (const end of ['a', 'b'] as const) {
      const pin = w[end].toLowerCase()
      atPin.set(pin, [...(atPin.get(pin) ?? []), { id: w.id, path: fromPin(w, end) }])
    }
  }

  // A zone from `start`, stopping short of the wire's middle; null if there's no room.
  const zoneFrom = (own: Point[], start: number) => {
    const half = lengthOf(own) / 2
    const stop = Math.min(start + GRAB_LENGTH, half)
    return stop - start >= MIN_ZONE ? slice(own, start, stop) : null
  }
  // Wires that leave the others on their pin only far out (they share most of the way)
  // would get a zone nowhere near the pin. Instead the latest of them gets the zone next
  // to the pin; the others are grabbed at their other end.
  const later = (p: string, q: string) => Number(p) - Number(q) || p.localeCompare(q)
  const stubOwner = new Map<string, string>()

  const zones = new Map<string, Grab>()
  const pending: { id: string; end: 'a' | 'b'; pin: string; own: Point[] }[] = []
  for (const w of wires) {
    if (!routes.has(w.id)) continue
    const grab: Grab = { a: null, b: null }
    for (const end of ['a', 'b'] as const) {
      const own = fromPin(w, end)
      const pin = w[end].toLowerCase()
      const others = (atPin.get(pin) ?? []).filter((o) => o.id !== w.id).map((o) => o.path)
      const shared = sharedLength(own, others)
      if (shared <= MAX_SHARED) {
        grab[end] = zoneFrom(own, Math.max(PIN_CLEAR, shared))
      } else {
        pending.push({ id: w.id, end, pin, own })
        const owner = stubOwner.get(pin)
        if (!owner || later(w.id, owner) > 0) stubOwner.set(pin, w.id)
      }
    }
    zones.set(w.id, grab)
  }
  for (const { id, end, pin, own } of pending)
    if (stubOwner.get(pin) === id) zones.get(id)![end] = zoneFrom(own, PIN_CLEAR)
  return zones
}
