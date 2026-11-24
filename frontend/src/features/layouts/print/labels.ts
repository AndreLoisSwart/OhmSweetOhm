/** A rectangle in the drawing's units (mm on the build sheet). */
export type Rect = { x: number; y: number; w: number; h: number }

/** Something a label shouldn't sit on: a body, a pin, a jumper. A label ignores its own body. */
export type Obstacle = { rect: Rect; owner?: string }

export type LabelIn = {
  key: string
  text: string
  /** Font size; the text is monospace. */
  size: number
  /** What it names: the label goes beside it, or inside its top-left corner if nothing fits. */
  around: Rect
}

/** Where to draw the text: x at its left, y at its baseline. */
export type Placed = { x: number; y: number; rect: Rect }

const CHAR = 0.62 // monospace advance, in font sizes

export function textRect(text: string, size: number, x: number, top: number): Rect {
  return { x, y: top, w: text.length * size * CHAR, h: size }
}

export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** The spots tried, best first: above or below (left, then right aligned), beside, inside. */
function candidates(label: LabelIn): Rect[] {
  const { around: b, size, text } = label
  const w = text.length * size * CHAR
  const h = size
  const gap = size * 0.25
  const above = b.y - gap - h
  const below = b.y + b.h + gap
  const middle = b.y + b.h / 2 - h / 2
  return [
    { x: b.x, y: above, w, h },
    { x: b.x, y: below, w, h },
    { x: b.x + b.w - w, y: above, w, h },
    { x: b.x + b.w - w, y: below, w, h },
    { x: b.x + b.w + gap, y: middle, w, h },
    { x: b.x - gap - w, y: middle, w, h },
    { x: b.x + gap, y: b.y + gap, w, h },
  ]
}

/**
 * Places each label beside what it names where it covers the least: other bodies, pins,
 * jumpers and labels already placed, and nothing outside bounds. Earlier labels choose
 * first. Ties go to the earlier spot in the list (above, left aligned).
 */
export function placeLabels(
  labels: LabelIn[],
  obstacles: Obstacle[],
  bounds: Rect,
): Map<string, Placed> {
  const out = new Map<string, Placed>()
  const placed: Rect[] = []
  for (const label of labels) {
    const blocking = obstacles.filter((o) => o.owner !== label.key).map((o) => o.rect)
    let best: Rect | null = null
    let bestScore = Infinity
    for (const spot of candidates(label)) {
      const area = spot.w * spot.h
      const outside = area - overlap(spot, bounds)
      const score =
        outside * 100 +
        blocking.reduce((sum, r) => sum + overlap(spot, r), 0) +
        placed.reduce((sum, r) => sum + overlap(spot, r) * 4, 0)
      if (score < bestScore - 1e-9) {
        best = spot
        bestScore = score
      }
    }
    if (!best) continue
    placed.push(best)
    out.set(label.key, { x: best.x, y: best.y + label.size * 0.8, rect: best })
  }
  return out
}
