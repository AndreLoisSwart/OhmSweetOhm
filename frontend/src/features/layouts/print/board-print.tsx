import { forwardRef, type ReactNode } from 'react'
import type { BuildSheetOut, LayoutDetail } from '@/api/generated/model'
import { stripLabel } from '../board/geometry'
import { type LabelIn, type Obstacle, placeLabels, type Rect } from './labels'

/** Above this many cuts, the copper side shows them unnumbered. */
export const MAX_NUMBERED_CUTS = 24

/**
 * Which drawing: the copper side with its cuts (a perfboard's traces), the copper side
 * with its bottom jumpers and every joint to solder, or the component side.
 */
export type PrintView = 'cuts' | 'jumpers' | 'component'

const MONO = 'ui-monospace, monospace'
const FAINT = '#9a9a9a'

/** A wire colour that shows on white paper: black prints dark grey inside its edge. */
const ink = (color: string) => (color === 'black' ? '#444' : color)

/**
 * One side of the board at true size, for printing (build step 19). Drawn in mm, so it
 * prints 1:1 at "Actual size", with cut, jumper and trace numbers matching the build
 * sheet. The copper side is mirrored left to right, as the board is when turned over.
 */
export const BoardPrint = forwardRef<
  SVGSVGElement,
  { layout: LayoutDetail; sheet: BuildSheetOut; view: PrintView }
>(function BoardPrint({ layout, sheet, view }, ref) {
  const p = layout.pitch_mm
  const copper = view !== 'component'
  // Room for the strip letters and hole numbers.
  const margin = 2.2 * p
  const x = (hole: number) => margin + (copper ? layout.holes - hole : hole - 1) * p + p / 2
  const y = (strip: number) => margin + (strip - 1) * p + p / 2
  const width = margin + layout.holes * p + p
  const height = margin + layout.strips * p + p
  const font = Math.min(1.6, p * 0.62)
  const cutNumber = new Map(sheet.cuts.map((c) => [c.cut_id, c.number]))
  // Many numbered cuts crowd into a smudge; then the marks alone, found by position
  // (strip letter and hole number) from the cut list.
  const numberCuts = sheet.cuts.length <= MAX_NUMBERED_CUTS
  const jumperNumber = new Map(sheet.jumpers.map((j) => [j.jumper_id, j.number]))
  const traceNumber = new Map(sheet.traces.map((t) => [t.trace_id, t.number]))
  const strips = Array.from({ length: layout.strips }, (_, i) => i + 1)
  const holes = Array.from({ length: layout.holes }, (_, i) => i + 1)
  const onBoard = layout.parts.filter((part) => part.on_board)
  const top = layout.jumpers.filter((j) => j.side === 'top')
  const bottom = layout.jumpers.filter((j) => j.side === 'bottom')
  const placedPins = (c: LayoutDetail['connectors'][number]) =>
    c.pins.filter(
      (pin): pin is typeof pin & { strip: number; hole: number } =>
        pin.strip != null && pin.hole != null,
    )

  const bodyRect = (b: { strip0: number; hole0: number; strip1: number; hole1: number }) => ({
    x: Math.min(x(b.hole0), x(b.hole1)),
    y: y(b.strip0),
    w: Math.abs(x(b.hole1) - x(b.hole0)),
    h: y(b.strip1) - y(b.strip0),
  })
  const cellRect = (strip: number, hole: number, size: number): Rect => ({
    x: x(hole) - size / 2,
    y: y(strip) - size / 2,
    w: size,
    h: size,
  })
  const spanRect = (cells: { strip: number; hole: number }[]): Rect => {
    const xs = cells.map((c) => x(c.hole))
    const ys = cells.map((c) => y(c.strip))
    const pad = p * 0.45
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
      h: Math.max(...ys) - Math.min(...ys) + 2 * pad,
    }
  }

  const numberTag = (cx: number, cy: number, n: number | string, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={font * 0.62} fill="white" stroke="black" strokeWidth={0.12} />
      <text
        x={cx}
        y={cy + font * 0.27}
        fontSize={font * 0.75}
        textAnchor="middle"
        fontFamily={MONO}
        fontWeight={700}
      >
        {n}
      </text>
    </g>
  )

  /** A wire: a dark edge with its colour inside; a bare link's colour is dashed. */
  const wire = (j: LayoutDetail['jumpers'][number], key: string, bare = false): ReactNode => {
    const ends = { x1: x(j.a_hole), y1: y(j.a_strip), x2: x(j.b_hole), y2: y(j.b_strip) }
    return (
      <g key={key}>
        <line {...ends} stroke="black" strokeWidth={0.75} strokeLinecap="round" />
        <line
          {...ends}
          stroke={ink(j.color)}
          strokeWidth={0.45}
          strokeLinecap="round"
          strokeDasharray={bare ? '0.9 0.5' : undefined}
        />
        {numberTag(
          (ends.x1 + ends.x2) / 2,
          (ends.y1 + ends.y2) / 2,
          jumperNumber.get(j.id) ?? 0,
          `${key}n`,
        )}
      </g>
    )
  }

  /** Faint part and connector outlines, to find your way on the copper side. */
  const outlines = (
    <>
      {onBoard.map(
        (part) =>
          part.body && (
            <rect
              key={`o${part.placement_id}`}
              {...rectProps(bodyRect(part.body))}
              fill="none"
              stroke={FAINT}
              strokeWidth={0.15}
              strokeDasharray="0.8 0.6"
            />
          ),
      )}
      {layout.connectors.map(
        (c) =>
          c.body && (
            <rect
              key={`oc${c.id}`}
              {...rectProps(bodyRect(c.body))}
              fill="none"
              stroke={FAINT}
              strokeWidth={0.15}
              strokeDasharray="0.8 0.6"
            />
          ),
      )}
    </>
  )

  /**
   * Cuts. Bold and numbered on the cuts drawing, with a white edge so a cut on a part's
   * outline stands out from it; faint and unnumbered on the jumpers drawing.
   */
  const cuts = (bold: boolean) =>
    layout.cuts.map((c) => {
      const n = cutNumber.get(c.id) ?? 0
      const tone = bold ? 'black' : FAINT
      const lines: [number, number, number, number][] = []
      const stroke = bold ? 0.5 : 0.3
      let tag: [number, number]
      if (c.between) {
        const cx = (x(c.hole) + x(c.hole + 1)) / 2
        lines.push([cx, y(c.strip) - p * 0.5, cx, y(c.strip) + p * 0.5])
        tag = [cx, y(c.strip) - p * 0.95]
      } else {
        const cx = x(c.hole)
        const cy = y(c.strip)
        const d = p * 0.38
        lines.push([cx - d, cy - d, cx + d, cy + d], [cx - d, cy + d, cx + d, cy - d])
        tag = [cx + p * 0.6, cy - p * 0.6]
      }
      return (
        <g key={c.id}>
          {bold &&
            lines.map(([x1, y1, x2, y2], i) => (
              <line
                key={`h${i}`}
                {...{ x1, y1, x2, y2 }}
                stroke="white"
                strokeWidth={stroke + 0.5}
                strokeLinecap="round"
              />
            ))}
          {lines.map(([x1, y1, x2, y2], i) => (
            <line key={i} {...{ x1, y1, x2, y2 }} stroke={tone} strokeWidth={stroke} />
          ))}
          {bold && numberCuts && numberTag(tag[0], tag[1], n, `n${c.id}`)}
        </g>
      )
    })

  /** Traces: solder along every pad they run over, numbered T1, T2… on the cuts drawing. */
  const traces = (numbered: boolean) =>
    layout.traces.map((t) => (
      <g key={`t${t.id}`}>
        <line
          x1={x(t.a_hole)}
          y1={y(t.a_strip)}
          x2={x(t.b_hole)}
          y2={y(t.b_strip)}
          stroke={numbered ? '#888' : '#bbb'}
          strokeWidth={p * 0.45}
          strokeLinecap="round"
        />
        {numbered &&
          numberTag(
            (x(t.a_hole) + x(t.b_hole)) / 2,
            (y(t.a_strip) + y(t.b_strip)) / 2 - (t.a_strip === t.b_strip ? p * 0.7 : 0),
            `T${traceNumber.get(t.id) ?? 0}`,
            `tn${t.id}`,
          )}
      </g>
    ))

  /** A ring at every joint: each leg, connector pin and top jumper end. */
  const joints = [
    ...onBoard.flatMap((part) =>
      part.pins.map((pin) => ({ key: pin.key, strip: pin.strip, hole: pin.hole })),
    ),
    ...layout.connectors.flatMap((c) =>
      placedPins(c).map((pin) => ({ key: `${c.id}-${pin.index}`, ...pin })),
    ),
    ...top.flatMap((j) => [
      { key: `ja${j.id}`, strip: j.a_strip, hole: j.a_hole },
      { key: `jb${j.id}`, strip: j.b_strip, hole: j.b_hole },
    ]),
  ].map((j) => (
    <circle
      key={j.key}
      cx={x(j.hole)}
      cy={y(j.strip)}
      r={p * 0.3}
      fill="none"
      stroke="black"
      strokeWidth={0.2}
    />
  ))

  /** Names beside what they name, clear of bodies, pins, jumpers and each other. */
  const labels = () => {
    const obstacles: Obstacle[] = [
      ...onBoard.flatMap((part) => [
        ...(part.body ? [{ rect: bodyRect(part.body), owner: part.ref }] : []),
        ...part.pins.map((pin) => ({ rect: cellRect(pin.strip, pin.hole, p * 0.6) })),
      ]),
      ...layout.connectors.flatMap((c) => [
        ...(c.body ? [{ rect: bodyRect(c.body), owner: c.ref }] : []),
        ...placedPins(c).map((pin) => ({ rect: cellRect(pin.strip, pin.hole, p * 0.9) })),
      ]),
      ...top.flatMap((j) => {
        const line = spanRect([
          { strip: j.a_strip, hole: j.a_hole },
          { strip: j.b_strip, hole: j.b_hole },
        ])
        const cx = (x(j.a_hole) + x(j.b_hole)) / 2
        const cy = (y(j.a_strip) + y(j.b_strip)) / 2
        const r = font * 0.62
        return [{ rect: line }, { rect: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r } }]
      }),
    ]
    const wanted: LabelIn[] = [
      ...onBoard
        .filter((part) => part.body || part.pins.length)
        .map((part) => ({
          key: part.ref,
          text: part.ref,
          size: font * 1.1,
          around: part.body ? bodyRect(part.body) : spanRect(part.pins),
        })),
      ...layout.connectors
        .filter((c) => c.body || placedPins(c).length)
        .map((c) => ({
          key: c.ref,
          text: c.ref,
          size: font,
          around: c.body ? bodyRect(c.body) : spanRect(placedPins(c)),
        })),
    ]
    const board = {
      x: margin - p * 0.3,
      y: margin - p * 0.3,
      w: layout.holes * p + p * 0.6,
      h: layout.strips * p + p * 0.6,
    }
    const placed = placeLabels(wanted, obstacles, board)
    return wanted.map((label) => {
      const at = placed.get(label.key)
      if (!at) return null
      return (
        <text
          key={`l${label.key}`}
          x={at.x}
          y={at.y}
          fontSize={label.size}
          fontFamily={MONO}
          fontWeight={700}
          stroke="white"
          strokeWidth={label.size * 0.3}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {label.text}
        </text>
      )
    })
  }

  const side =
    view === 'component'
      ? 'component side'
      : view === 'cuts'
        ? 'copper side (mirrored), cuts'
        : 'copper side (mirrored), bottom jumpers'

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={`${width}mm`}
      height={`${height}mm`}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      role="img"
      aria-label={`${layout.name}, ${side}, true size`}
    >
      <rect width={width} height={height} fill="white" />
      {/* The board's edge. */}
      <rect
        x={margin - p * 0.3}
        y={margin - p * 0.3}
        width={layout.holes * p + p * 0.6}
        height={layout.strips * p + p * 0.6}
        rx={p * 0.3}
        fill="none"
        stroke="black"
        strokeWidth={0.25}
      />
      {/* Labels. */}
      {strips.map((s) => (
        <text
          key={`s${s}`}
          x={margin - p * 0.9}
          y={y(s) + font * 0.35}
          fontSize={font}
          textAnchor="middle"
          fontFamily={MONO}
        >
          {stripLabel(s)}
        </text>
      ))}
      {holes.map((h) => (
        <text
          key={`h${h}`}
          x={x(h)}
          y={margin - p * 0.75}
          fontSize={font * 0.8}
          textAnchor="middle"
          fontFamily={MONO}
        >
          {h}
        </text>
      ))}
      {/* A1, marked in its corner on both sides. */}
      <path
        d={`M ${x(1) + (copper ? p * 0.55 : -p * 0.55)} ${y(1) - p * 0.55} l ${copper ? -p * 0.5 : p * 0.5} 0 l ${copper ? p * 0.5 : -p * 0.5} ${p * 0.5} z`}
        fill="black"
      />
      {/* Copper: solid on the copper side, faint on the component side. */}
      {layout.segments.map((seg, i) => {
        const xs = [x(seg.a_hole), x(seg.b_hole)]
        const horizontal = seg.a_strip === seg.b_strip
        return (
          <rect
            key={i}
            x={horizontal ? Math.min(...xs) - p * 0.42 : x(seg.a_hole) - p * 0.36}
            y={y(seg.a_strip) - p * 0.36}
            width={horizontal ? Math.abs(xs[1] - xs[0]) + p * 0.84 : p * 0.72}
            height={y(seg.b_strip) - y(seg.a_strip) + p * 0.72}
            rx={p * 0.12}
            fill={copper ? '#d4d4d4' : '#f2f2f2'}
          />
        )
      })}
      {strips.map((s) =>
        holes.map((h) => (
          <circle
            key={`${s}-${h}`}
            cx={x(h)}
            cy={y(s)}
            r={p * 0.16}
            fill="white"
            stroke={FAINT}
            strokeWidth={0.1}
          />
        )),
      )}

      {view === 'cuts' && (
        <>
          {outlines}
          {traces(true)}
          {cuts(true)}
        </>
      )}

      {view === 'jumpers' && (
        <>
          {outlines}
          {traces(false)}
          {cuts(false)}
          {joints}
          {bottom.map((j) => wire(j, `b${j.id}`, !j.insulated))}
        </>
      )}

      {view === 'component' && (
        <>
          {/* Parts: outline, legs (pin 1 square). */}
          {onBoard.map((part) => (
            <g key={part.placement_id}>
              {part.body && (
                <rect
                  {...rectProps(bodyRect(part.body))}
                  rx={p * 0.15}
                  fill="none"
                  stroke="black"
                  strokeWidth={0.25}
                  strokeDasharray={part.mount === 'socketed' ? '1.2 0.6' : undefined}
                />
              )}
              {part.pins.map((pin, i) =>
                i === 0 ? (
                  <rect
                    key={pin.key}
                    x={x(pin.hole) - p * 0.28}
                    y={y(pin.strip) - p * 0.28}
                    width={p * 0.56}
                    height={p * 0.56}
                    fill="black"
                  />
                ) : (
                  <circle
                    key={pin.key}
                    cx={x(pin.hole)}
                    cy={y(pin.strip)}
                    r={p * 0.25}
                    fill="black"
                  />
                ),
              )}
            </g>
          ))}
          {/* Connectors: the housing, a box per pin (pin 1 filled), − on ground, + on a supply. */}
          {layout.connectors.map((c) => (
            <g key={c.id}>
              {c.body && (
                <rect
                  {...rectProps(bodyRect(c.body))}
                  fill="none"
                  stroke="black"
                  strokeWidth={0.25}
                />
              )}
              {placedPins(c).map((pin) => {
                const first = pin.index === 1
                const sign = pin.role === 'ground' ? '−' : pin.role === 'supply' ? '+' : null
                return (
                  <g key={pin.index}>
                    <rect
                      x={x(pin.hole) - p * 0.45}
                      y={y(pin.strip) - p * 0.45}
                      width={p * 0.9}
                      height={p * 0.9}
                      fill={first ? 'black' : 'white'}
                      stroke="black"
                      strokeWidth={0.2}
                    />
                    {sign && (
                      <text
                        x={x(pin.hole)}
                        y={y(pin.strip) + p * 0.27}
                        fontSize={p * 0.8}
                        textAnchor="middle"
                        fontFamily={MONO}
                        fontWeight={700}
                        fill={first ? 'white' : 'black'}
                      >
                        {sign}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          ))}
          {/* Top jumpers in their colour, numbered as on the jumper list. */}
          {top.map((j) => wire(j, `j${j.id}`))}
          {labels()}
        </>
      )}
    </svg>
  )
})

function rectProps(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h }
}
