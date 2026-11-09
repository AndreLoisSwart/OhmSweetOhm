import { forwardRef } from 'react'
import type { BuildSheetOut, LayoutDetail } from '@/api/generated/model'
import { stripLabel } from '../board/geometry'

/** Above this many cuts, the copper side shows them unnumbered. */
export const MAX_NUMBERED_CUTS = 24

/**
 * One side of the board at true size, for printing (build step 19). Drawn in mm, so it
 * prints 1:1 at "Actual size"; black on white, with cut and jumper numbers matching the
 * build sheet. The copper side is mirrored left to right, as the board is when turned
 * over.
 */
export const BoardPrint = forwardRef<
  SVGSVGElement,
  { layout: LayoutDetail; sheet: BuildSheetOut; side: 'component' | 'copper' }
>(function BoardPrint({ layout, sheet, side }, ref) {
  const p = layout.pitch_mm
  const copper = side === 'copper'
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
  const strips = Array.from({ length: layout.strips }, (_, i) => i + 1)
  const holes = Array.from({ length: layout.holes }, (_, i) => i + 1)
  const onBoard = layout.parts.filter((part) => part.on_board)

  const numberTag = (cx: number, cy: number, n: number, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={font * 0.62} fill="white" stroke="black" strokeWidth={0.12} />
      <text
        x={cx}
        y={cy + font * 0.27}
        fontSize={font * 0.75}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
      >
        {n}
      </text>
    </g>
  )

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={`${width}mm`}
      height={`${height}mm`}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      role="img"
      aria-label={`${layout.name}, ${copper ? 'copper side (mirrored)' : 'component side'}, true size`}
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
          fontFamily="ui-monospace, monospace"
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
          fontFamily="ui-monospace, monospace"
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
            stroke="#9a9a9a"
            strokeWidth={0.1}
          />
        )),
      )}

      {copper ? (
        <>
          {/* Cuts, bold and numbered as on the cut list. */}
          {layout.cuts.map((c) => {
            const n = cutNumber.get(c.id) ?? 0
            if (c.between) {
              const cx = (x(c.hole) + x(c.hole + 1)) / 2
              return (
                <g key={c.id}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={y(c.strip) - p * 0.5}
                    y2={y(c.strip) + p * 0.5}
                    stroke="black"
                    strokeWidth={0.5}
                  />
                  {numberCuts && numberTag(cx, y(c.strip) - p * 0.95, n, `n${c.id}`)}
                </g>
              )
            }
            const cx = x(c.hole)
            const cy = y(c.strip)
            const d = p * 0.38
            return (
              <g key={c.id}>
                <line
                  x1={cx - d}
                  y1={cy - d}
                  x2={cx + d}
                  y2={cy + d}
                  stroke="black"
                  strokeWidth={0.45}
                />
                <line
                  x1={cx - d}
                  y1={cy + d}
                  x2={cx + d}
                  y2={cy - d}
                  stroke="black"
                  strokeWidth={0.45}
                />
                {numberCuts && numberTag(cx + p * 0.6, cy - p * 0.6, n, `n${c.id}`)}
              </g>
            )
          })}
          {/* Bottom links. */}
          {layout.jumpers
            .filter((j) => j.side === 'bottom')
            .map((j) => (
              <g key={j.id}>
                <line
                  x1={x(j.a_hole)}
                  y1={y(j.a_strip)}
                  x2={x(j.b_hole)}
                  y2={y(j.b_strip)}
                  stroke="black"
                  strokeWidth={0.5}
                  strokeLinecap="round"
                  strokeDasharray={j.insulated ? '1 0.6' : undefined}
                />
                {numberTag(
                  (x(j.a_hole) + x(j.b_hole)) / 2,
                  (y(j.a_strip) + y(j.b_strip)) / 2,
                  jumperNumber.get(j.id) ?? 0,
                  `j${j.id}`,
                )}
              </g>
            ))}
          {/* Where to solder: every leg, connector pin and top jumper end. */}
          {onBoard.flatMap((part) =>
            part.pins.map((pin) => (
              <circle
                key={pin.key}
                cx={x(pin.hole)}
                cy={y(pin.strip)}
                r={p * 0.3}
                fill="none"
                stroke="black"
                strokeWidth={0.2}
              />
            )),
          )}
          {layout.connectors.flatMap((c) =>
            c.pins
              .filter((pin) => pin.strip != null && pin.hole != null)
              .map((pin) => (
                <circle
                  key={`${c.id}-${pin.index}`}
                  cx={x(pin.hole!)}
                  cy={y(pin.strip!)}
                  r={p * 0.3}
                  fill="none"
                  stroke="black"
                  strokeWidth={0.2}
                />
              )),
          )}
          {layout.jumpers
            .filter((j) => j.side === 'top')
            .flatMap((j) => [
              [j.a_strip, j.a_hole],
              [j.b_strip, j.b_hole],
            ])
            .map(([s, h], i) => (
              <circle
                key={`t${i}`}
                cx={x(h)}
                cy={y(s)}
                r={p * 0.3}
                fill="none"
                stroke="black"
                strokeWidth={0.2}
              />
            ))}
          {/* Faint outlines, to find your way. */}
          {onBoard.map(
            (part) =>
              part.body && (
                <rect
                  key={part.placement_id}
                  x={Math.min(x(part.body.hole0), x(part.body.hole1))}
                  y={y(part.body.strip0)}
                  width={Math.abs(x(part.body.hole1) - x(part.body.hole0))}
                  height={y(part.body.strip1) - y(part.body.strip0)}
                  fill="none"
                  stroke="#9a9a9a"
                  strokeWidth={0.15}
                  strokeDasharray="0.8 0.6"
                />
              ),
          )}
        </>
      ) : (
        <>
          {/* Parts: outline, legs (pin 1 square), ref. */}
          {onBoard.map((part) => {
            const body = part.body
            const first = part.pins[0]
            const bx = body ? Math.min(x(body.hole0), x(body.hole1)) : 0
            return (
              <g key={part.placement_id}>
                {body && (
                  <rect
                    x={bx}
                    y={y(body.strip0)}
                    width={Math.abs(x(body.hole1) - x(body.hole0))}
                    height={y(body.strip1) - y(body.strip0)}
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
                {(body || first) && (
                  <text
                    x={body ? bx + p * 0.3 : x(first.hole) + p * 0.4}
                    y={body ? y(body.strip0) + font * 1.1 : y(first.strip) - p * 0.4}
                    fontSize={font * 1.1}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={700}
                  >
                    {part.ref}
                  </text>
                )}
              </g>
            )
          })}
          {/* Connectors: a box per pin, pin 1 filled. */}
          {layout.connectors.map((c) => (
            <g key={c.id}>
              {c.pins
                .filter((pin) => pin.strip != null && pin.hole != null)
                .map((pin) => (
                  <rect
                    key={pin.index}
                    x={x(pin.hole!) - p * 0.45}
                    y={y(pin.strip!) - p * 0.45}
                    width={p * 0.9}
                    height={p * 0.9}
                    fill={pin.index === 1 ? 'black' : 'white'}
                    stroke="black"
                    strokeWidth={0.2}
                  />
                ))}
              {c.pins[0]?.strip != null && c.pins[0]?.hole != null && (
                <text
                  x={x(c.pins[0].hole) + p * 0.6}
                  y={y(c.pins[0].strip) - p * 0.55}
                  fontSize={font}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={700}
                >
                  {c.ref}
                </text>
              )}
            </g>
          ))}
          {/* Top jumpers in their colour, numbered as on the jumper list. */}
          {layout.jumpers
            .filter((j) => j.side === 'top')
            .map((j) => (
              <g key={j.id}>
                <line
                  x1={x(j.a_hole)}
                  y1={y(j.a_strip)}
                  x2={x(j.b_hole)}
                  y2={y(j.b_strip)}
                  stroke="black"
                  strokeWidth={0.75}
                  strokeLinecap="round"
                />
                <line
                  x1={x(j.a_hole)}
                  y1={y(j.a_strip)}
                  x2={x(j.b_hole)}
                  y2={y(j.b_strip)}
                  stroke={j.color === 'black' ? '#444' : j.color}
                  strokeWidth={0.45}
                  strokeLinecap="round"
                />
                {numberTag(
                  (x(j.a_hole) + x(j.b_hole)) / 2,
                  (y(j.a_strip) + y(j.b_strip)) / 2,
                  jumperNumber.get(j.id) ?? 0,
                  `j${j.id}`,
                )}
              </g>
            ))}
        </>
      )}
    </svg>
  )
})
