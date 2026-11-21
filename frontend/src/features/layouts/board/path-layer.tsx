// The traced path (build step 23), drawn over the board: everything else dimmed, the
// path's own items in their own colours over one accent halo, with a moving dashed line
// along it. Colours of jumpers and copper vary, so the halo is what reads as one path.
import type { LayoutDetail } from '@/api/generated/model'
import { type BoardView, type Cell, holeX, netColor, STEP, stripY } from './geometry'
import type { PathResult, Span } from './path'

const HALO = 'oklch(0.84 0.17 85)'
const SHORT = 'oklch(0.62 0.22 25)'
const REACH_A = 'oklch(0.68 0.15 250)'
const REACH_B = 'oklch(0.7 0.16 150)'
const COPPER = 'oklch(0.72 0.11 60)'
const BARE_WIRE = 'oklch(0.7 0.02 260)'

const xy = (c: Cell, view: BoardView) => ({ x: holeX(c.hole, view), y: stripY(c.strip) })

function line(span: Span, view: BoardView) {
  const a = xy(span.from, view)
  const b = xy(span.to, view)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}

/** The colour of the copper at a hole: its run's net, hatched when it shorts. */
function copperAt(layout: LayoutDetail, cell: Cell): string {
  const seg = layout.segments.find(
    (s) =>
      cell.strip >= Math.min(s.a_strip, s.b_strip) &&
      cell.strip <= Math.max(s.a_strip, s.b_strip) &&
      cell.hole >= Math.min(s.a_hole, s.b_hole) &&
      cell.hole <= Math.max(s.a_hole, s.b_hole),
  )
  if (!seg) return COPPER
  if (seg.short) return 'url(#short-hatch)'
  return seg.nets.length ? netColor(seg.nets[0]) : COPPER
}

/** A moving dashed line along a stretch of the path. */
function Ants({ span, view }: { span: Span; view: BoardView }) {
  return (
    <line {...line(span, view)} stroke="white" strokeWidth={1.5} strokeDasharray="4 4">
      <animate
        attributeName="stroke-dashoffset"
        from="0"
        to="-16"
        dur="0.9s"
        repeatCount="indefinite"
      />
    </line>
  )
}

export function PathLayer({
  path,
  layout,
  view,
  pinCells,
  pinColor,
}: {
  path: PathResult
  layout: LayoutDetail
  view: BoardView
  /** Where each pin on the board is, by key (part pins, and pins a connector carries). */
  pinCells: Map<string, Cell>
  /** A pin's colour on the board: its net's. */
  pinColor: (key: string) => string
}) {
  const flipped = view.flipped
  const halo = path.kind === 'short' ? SHORT : HALO
  const joined = path.kind === 'same' || path.kind === 'short' || path.kind === 'joined'
  const jumpers = path.jumpers.flatMap((used) => {
    const j = layout.jumpers.find((x) => x.id === used.id)
    return j ? [{ used, j }] : []
  })
  const traces = path.traces.flatMap((used) => {
    const t = layout.traces.find((x) => x.id === used.id)
    return t ? [{ used, t }] : []
  })
  const arcs = path.inside.flatMap(({ a, b }) => {
    const from = pinCells.get(a)
    const to = pinCells.get(b)
    if (!from || !to) return []
    const p = xy(from, view)
    const q = xy(to, view)
    // Bowed sideways, so it doesn't lie along the copper between them.
    const mx = (p.x + q.x) / 2 - (q.y - p.y) * 0.25
    const my = (p.y + q.y) / 2 + (q.x - p.x) * 0.25
    return [{ key: `${a}-${b}`, d: `M ${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}` }]
  })
  const ends = [
    { end: path.a, name: 'A' },
    { end: path.b, name: 'B' },
  ]
  // Every stretch the dashed line runs along: copper, traces and jumpers.
  const spans: Span[] = [
    ...path.copper,
    ...path.traces,
    ...jumpers.map(({ j }) => ({
      from: { strip: j.a_strip, hole: j.a_hole },
      to: { strip: j.b_strip, hole: j.b_hole },
    })),
  ]
  return (
    <g className="pointer-events-none" aria-hidden>
      {/* Everything else, dimmed. */}
      <rect x={-5000} y={-5000} width={20000} height={20000} className="fill-card" opacity={0.72} />

      {!joined && (
        <>
          {[
            { holes: path.reachA, color: REACH_A },
            { holes: path.reachB, color: REACH_B },
          ].map(({ holes, color }, i) =>
            holes.map((at) => {
              const cell = { strip: at.charCodeAt(0) - 64, hole: Number(at.slice(1)) }
              // Labels past Z (AA…) don't fit that sum; leave them untinted.
              if (!/^[A-Z]\d+$/.test(at)) return null
              const c = xy(cell, view)
              return (
                <rect
                  key={`${i}-${at}`}
                  x={c.x - STEP * 0.45}
                  y={c.y - STEP * 0.4}
                  width={STEP * 0.9}
                  height={STEP * 0.8}
                  rx={3}
                  fill={color}
                  opacity={0.45}
                />
              )
            }),
          )}
          {path.kind === 'missing' && (
            <line
              {...line({ from: path.a.cell, to: path.b.cell }, view)}
              stroke={netColor(path.netA ?? '')}
              strokeWidth={2.5}
              strokeDasharray="6 4"
            />
          )}
        </>
      )}

      {joined && (
        <>
          {/* The halo under everything on the path. */}
          <g stroke={halo} strokeLinecap="round" fill="none" opacity={0.55}>
            {spans.map((span, i) => (
              <line key={i} {...line(span, view)} strokeWidth={STEP * 0.95} />
            ))}
            {arcs.map((arc) => (
              <path key={arc.key} d={arc.d} strokeWidth={8} />
            ))}
          </g>
          {/* The path's own items, in their own colours. */}
          {path.copper.map((span, i) => (
            <line
              key={`c${i}`}
              {...line(span, view)}
              stroke={copperAt(layout, span.from)}
              strokeWidth={STEP * 0.7}
              strokeLinecap="round"
            />
          ))}
          {traces.map(({ used, t }) => (
            <line
              key={`t${t.id}`}
              {...line(used, view)}
              stroke={t.short ? 'url(#short-hatch)' : t.nets.length ? netColor(t.nets[0]) : COPPER}
              strokeWidth={STEP * 0.5}
              strokeLinecap="round"
            />
          ))}
          {jumpers.map(({ j }) => {
            // A top jumper seen from the copper side, or the copper side's links seen from
            // the top, is on the far side of the board: dashed.
            const far = j.side === 'top' ? flipped : false
            return (
              <line
                key={`j${j.id}`}
                {...line(
                  {
                    from: { strip: j.a_strip, hole: j.a_hole },
                    to: { strip: j.b_strip, hole: j.b_hole },
                  },
                  view,
                )}
                stroke={j.side === 'bottom' && !j.insulated ? BARE_WIRE : j.color}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={far ? '5 4' : undefined}
              />
            )
          })}
          {arcs.map((arc) => (
            <path
              key={arc.key}
              d={arc.d}
              fill="none"
              stroke="currentColor"
              className="text-foreground"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          ))}
          {spans.map((span, i) => (
            <Ants key={i} span={span} view={view} />
          ))}
          {path.pins.map((key) => {
            const cell = pinCells.get(key)
            if (!cell) return null
            const c = xy(cell, view)
            return (
              <circle
                key={key}
                cx={c.x}
                cy={c.y}
                r={5}
                fill={pinColor(key)}
                className="stroke-background"
                strokeWidth={1.5}
              />
            )
          })}
        </>
      )}

      {/* A and B. */}
      {ends.map(({ end, name }) => {
        const c = xy(end.cell, view)
        return (
          <g key={name}>
            <circle
              cx={c.x}
              cy={c.y}
              r={9}
              fill="none"
              stroke={joined ? halo : name === 'A' ? REACH_A : REACH_B}
              strokeWidth={3}
            />
            <text
              x={c.x + 10}
              y={c.y - 9}
              fontSize={11}
              className="fill-foreground font-mono font-bold"
              stroke="var(--card)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
