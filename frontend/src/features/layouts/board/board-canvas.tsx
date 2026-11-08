import { cn } from 'cn'
import { Maximize } from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ConnectorOut, DesignDetail, LayoutDetail, LayoutPartOut } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { type BoardHighlight, PLACEMENT_MIME } from './highlight'
import {
  type BoardView,
  boardSize,
  boxRect,
  type Cell,
  cellAt,
  cellLabel,
  footprintOffsets,
  holeX,
  MARGIN,
  netColor,
  rotate,
  STEP,
  stripLabel,
  stripY,
} from './geometry'
import { type CutTarget, cutTarget, type Selection, type Tool } from './tools'

interface Viewport {
  x: number
  y: number
  k: number
}

/** The whole board in view, centred. */
function fitted(box: { width: number; height: number }, size: { width: number; height: number }) {
  if (!box.width || !box.height) return { x: 0, y: 0, k: 1 }
  const k = Math.min(box.width / size.width, box.height / size.height, 2) * 0.96
  return { k, x: (box.width - size.width * k) / 2, y: (box.height - size.height * k) / 2 }
}

/** Keeps the pointer's events coming here while dragging, off the board too. */
function capture(event: ReactPointerEvent) {
  try {
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  } catch {
    // A pointer that's already gone: nothing to capture.
  }
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

/** A part or connector being dragged: it moves by whole holes. */
interface Drag {
  kind: 'part' | 'connector'
  id: number
  startX: number
  startY: number
  dStrip: number
  dHole: number
  moved: boolean
}

export function BoardCanvas({
  layout,
  design,
  flipped,
  tool,
  selected,
  onSelect,
  highlight,
  armed,
  onPlace,
  onMove,
  onMoveConnector,
  onCut,
  jumperStart,
  onJumperPoint,
  connectorPreview,
  armedRotation,
  onConnectorAt,
  readOnly,
}: {
  layout: LayoutDetail
  design: DesignDetail
  flipped: boolean
  tool: Tool
  selected: Selection
  onSelect: (selection: Selection) => void
  highlight: BoardHighlight
  /** A placement from the tray waiting to be put down with a click (touch). */
  armed: number | null
  onPlace: (placementId: number, at: Cell) => void
  onMove: (part: LayoutPartOut, at: Cell) => void
  onMoveConnector: (connector: ConnectorOut, at: Cell) => void
  onCut: (target: CutTarget) => void
  /** The jumper tool's first hole, once picked. */
  jumperStart: Cell | null
  onJumperPoint: (cell: Cell) => void
  /** The connector tool's pins, for the preview: how many, and holes between them. */
  connectorPreview: { pins: number; step: number; rotation: number } | null
  /** How a part armed from the tray will be turned when it's put down. */
  armedRotation: number
  onConnectorAt: (cell: Cell) => void
  readOnly: boolean
}) {
  const view: BoardView = { strips: layout.strips, holes: layout.holes, flipped }
  const size = boardSize(view)
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  // Where the pointer is on the drawing, for the tools' previews.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const hoverCell = hover ? cellAt(hover.x, hover.y, view) : null

  // Whether the user has panned or zoomed since the last fit.
  const touched = useRef(false)
  const fit = () => {
    const box = container.current?.getBoundingClientRect()
    touched.current = false
    if (box) setViewport(fitted(box, size))
  }

  // Kept fitted as the space for it changes (the page settling, a panel opening),
  // until the user pans or zooms.
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const refit = () => {
      if (!touched.current) setViewport(fitted(el.getBoundingClientRect(), size))
    }
    refit()
    const observer = new ResizeObserver(refit)
    observer.observe(el)
    return () => observer.disconnect()
    // size is two numbers; refit when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height])

  // Wheel zooms around the pointer; it's a native listener so it can stop the page
  // scrolling.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      touched.current = true
      const box = el.getBoundingClientRect()
      const px = event.clientX - box.left
      const py = event.clientY - box.top
      setViewport((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * Math.exp(-event.deltaY * 0.0015)))
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /** A screen point in the board's drawing coordinates. */
  const toBoard = (clientX: number, clientY: number) => {
    const box = container.current!.getBoundingClientRect()
    return {
      x: (clientX - box.left - viewport.x) / viewport.k,
      y: (clientY - box.top - viewport.y) / viewport.k,
    }
  }
  const cellFrom = (clientX: number, clientY: number) => {
    const p = toBoard(clientX, clientY)
    return cellAt(p.x, p.y, view)
  }

  // Nets by pin, for tinting pins.
  const netOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const net of design.nets) for (const pin of net.pins) map.set(pin, net.name)
    return map
  }, [design.nets])

  const onBackgroundDown = (event: ReactPointerEvent) => {
    // The middle button pans with any tool.
    if (event.button !== 0 && event.button !== 1) return
    if (event.button === 0 && !readOnly) {
      const p = toBoard(event.clientX, event.clientY)
      if (armed !== null) return onPlace(armed, cellAt(p.x, p.y, view))
      if (tool === 'cut') return onCut(cutTarget(p.x, p.y, view))
      if (tool === 'jumper') return onJumperPoint(cellAt(p.x, p.y, view))
      if (tool === 'connector') return onConnectorAt(cellAt(p.x, p.y, view))
    }
    touched.current = true
    pan.current = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y }
    capture(event)
  }

  /** Selecting and dragging only with the select tool; other tools see through parts. */
  const selecting = tool === 'select' && armed === null
  const onPartDown = (event: ReactPointerEvent, part: LayoutPartOut) => {
    if (event.button !== 0 || !selecting) return
    event.stopPropagation()
    onSelect({ kind: 'part', id: part.placement_id })
    if (readOnly) return
    capture(event)
    setDrag({
      kind: 'part',
      id: part.placement_id,
      startX: event.clientX,
      startY: event.clientY,
      dStrip: 0,
      dHole: 0,
      moved: false,
    })
  }

  const onConnectorDown = (event: ReactPointerEvent, connector: ConnectorOut) => {
    if (event.button !== 0 || !selecting) return
    event.stopPropagation()
    onSelect({ kind: 'connector', id: connector.id })
    if (readOnly) return
    capture(event)
    setDrag({
      kind: 'connector',
      id: connector.id,
      startX: event.clientX,
      startY: event.clientY,
      dStrip: 0,
      dHole: 0,
      moved: false,
    })
  }

  const onJumperDown = (event: ReactPointerEvent, jumperId: number) => {
    if (event.button !== 0 || !selecting) return
    event.stopPropagation()
    onSelect({ kind: 'jumper', id: jumperId })
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    if (drag) {
      const dx = (event.clientX - drag.startX) / viewport.k
      const dy = (event.clientY - drag.startY) / viewport.k
      const dHole = Math.round(dx / STEP) * (flipped ? -1 : 1)
      const dStrip = Math.round(dy / STEP)
      if (dHole !== drag.dHole || dStrip !== drag.dStrip || (!drag.moved && Math.hypot(dx, dy) > 4))
        setDrag({ ...drag, dHole, dStrip, moved: drag.moved || Math.hypot(dx, dy) > 4 })
      return
    }
    if (pan.current) {
      // Worked out now: React runs an update function later, by which time the button
      // may be up and the pan gone.
      const start = pan.current
      const x = start.vx + event.clientX - start.x
      const y = start.vy + event.clientY - start.y
      setViewport((v) => ({ ...v, x, y }))
      return
    }
    if (armed !== null || tool !== 'select') setHover(toBoard(event.clientX, event.clientY))
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    if (drag) {
      const moved = drag.moved && (drag.dHole || drag.dStrip)
      if (drag.kind === 'part') {
        const part = layout.parts.find((p) => p.placement_id === drag.id)
        if (part && moved && part.strip != null && part.hole != null)
          onMove(part, { strip: part.strip + drag.dStrip, hole: part.hole + drag.dHole })
      } else {
        const c = layout.connectors.find((x) => x.id === drag.id)
        if (c && moved && c.strip != null && c.hole != null)
          onMoveConnector(c, { strip: c.strip + drag.dStrip, hole: c.hole + drag.dHole })
      }
      setDrag(null)
      return
    }
    if (pan.current) {
      const moved = Math.hypot(event.clientX - pan.current.x, event.clientY - pan.current.y) > 4
      pan.current = null
      // A click on the empty board clears the selection.
      if (!moved) onSelect(null)
    }
  }

  const onDrop = (event: React.DragEvent) => {
    const id = Number(event.dataTransfer.getData(PLACEMENT_MIME))
    if (!id || readOnly) return
    event.preventDefault()
    onPlace(id, cellFrom(event.clientX, event.clientY))
  }

  const onBoard = layout.parts.filter((p) => p.on_board)
  const armedPart = armed !== null ? design.placements.find((p) => p.id === armed) : undefined
  const armedPins =
    armedPart && hoverCell
      ? footprintOffsets(
          design.parts.find((p) => p.id === armedPart.part_id)?.pins ?? [],
          armedRotation,
          layout.pitch_mm,
        ).map((o) => ({ strip: hoverCell.strip + o.strip, hole: hoverCell.hole + o.hole }))
      : []
  const copperOpacity = flipped ? 0.85 : 0.35
  const strips = Array.from({ length: layout.strips }, (_, i) => i + 1)
  const holes = Array.from({ length: layout.holes }, (_, i) => i + 1)

  return (
    <div
      ref={container}
      className={cn(
        'relative h-full w-full touch-none overflow-hidden bg-muted/40 select-none',
        (armed !== null || tool !== 'select') && 'cursor-crosshair',
      )}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(PLACEMENT_MIME)) event.preventDefault()
      }}
      onDrop={onDrop}
    >
      <svg
        ref={svg}
        className="absolute inset-0 h-full w-full"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${layout.name}: ${layout.strips} by ${layout.holes} ${layout.board_type}, ${flipped ? 'copper side' : 'component side'}`}
      >
        <defs>
          <pattern
            id="short-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="oklch(0.6 0.2 25 / 0.35)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="oklch(0.6 0.22 25)" strokeWidth="3" />
          </pattern>
        </defs>
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
          {/* The board. */}
          <rect
            x={MARGIN - 4}
            y={MARGIN - 4}
            width={layout.holes * STEP + 8}
            height={layout.strips * STEP + 8}
            rx={6}
            className="fill-card stroke-border"
          />
          {/* Labels: strip letters down the side, hole numbers along the top. */}
          {strips.map((s) => (
            <text
              key={`s${s}`}
              x={MARGIN - 12}
              y={stripY(s) + 3.5}
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize={10}
            >
              {stripLabel(s)}
            </text>
          ))}
          {holes.map((h) => (
            <text
              key={`h${h}`}
              x={holeX(h, view)}
              y={MARGIN - 10}
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize={9}
            >
              {h}
            </text>
          ))}
          {/* Copper, tinted by the net it carries. */}
          {layout.segments.map((seg, i) => {
            const horizontal = seg.a_strip === seg.b_strip
            const xs = [holeX(seg.a_hole, view), holeX(seg.b_hole, view)]
            const x = Math.min(...xs) - STEP * 0.42
            const y = stripY(seg.a_strip) - STEP * 0.36
            const width = Math.abs(xs[1] - xs[0]) + STEP * 0.84
            const height = stripY(seg.b_strip) - stripY(seg.a_strip) + STEP * 0.72
            const short = seg.short
            return (
              <rect
                key={i}
                x={horizontal ? x : holeX(seg.a_hole, view) - STEP * 0.36}
                y={y}
                width={horizontal ? width : STEP * 0.72}
                height={height}
                rx={3}
                fill={
                  short
                    ? 'url(#short-hatch)'
                    : seg.nets.length
                      ? netColor(seg.nets[0])
                      : 'oklch(0.72 0.11 60)'
                }
                opacity={short ? 1 : copperOpacity}
              >
                <title>
                  {short
                    ? `Short: ${seg.nets.join(' + ') || 'joins pins the design keeps apart'}`
                    : seg.nets.length
                      ? seg.nets.join(' + ')
                      : 'Unused copper'}
                </title>
              </rect>
            )
          })}
          {/* Holes. */}
          {strips.map((s) =>
            holes.map((h) => (
              <circle
                key={`${s}-${h}`}
                cx={holeX(h, view)}
                cy={stripY(s)}
                r={2.6}
                className={cn(
                  highlight.holes.has(cellLabel({ strip: s, hole: h }))
                    ? 'fill-status-red'
                    : 'fill-background',
                )}
              />
            )),
          )}
          {/* Cuts: a gap in the copper at a hole, or a bar between two. */}
          {layout.cuts.map((cut) =>
            cut.between ? (
              <line
                key={cut.id}
                x1={(holeX(cut.hole, view) + holeX(cut.hole + 1, view)) / 2}
                x2={(holeX(cut.hole, view) + holeX(cut.hole + 1, view)) / 2}
                y1={stripY(cut.strip) - STEP * 0.42}
                y2={stripY(cut.strip) + STEP * 0.42}
                stroke="oklch(0.6 0.22 25)"
                strokeWidth={3}
                opacity={flipped ? 1 : 0.5}
              >
                <title>Cut between {cut.at} and the next hole</title>
              </line>
            ) : (
              <g key={cut.id} opacity={flipped ? 1 : 0.5}>
                <circle
                  cx={holeX(cut.hole, view)}
                  cy={stripY(cut.strip)}
                  r={STEP * 0.42}
                  className="fill-card"
                  stroke="oklch(0.6 0.22 25)"
                  strokeWidth={2}
                />
                <title>Cut at {cut.at}</title>
              </g>
            ),
          )}
          {/* Bottom links lie on the copper. */}
          {layout.jumpers
            .filter((j) => j.side === 'bottom')
            .map((j) => (
              <JumperLine
                key={j.id}
                jumper={j}
                view={view}
                color={j.insulated ? j.color : 'oklch(0.7 0.02 260)'}
                opacity={flipped ? 0.95 : 0.35}
                selected={selected?.kind === 'jumper' && selected.id === j.id}
                selectable={selecting}
                onPointerDown={(e) => onJumperDown(e, j.id)}
                label={`Bottom link ${j.a} → ${j.b}${j.insulated ? ' (insulated)' : ''}`}
              />
            ))}
          {/* Parts. */}
          {onBoard.map((part) => {
            const dragging = drag?.kind === 'part' && drag.id === part.placement_id
            const dx = dragging ? drag.dHole * STEP * (flipped ? -1 : 1) : 0
            const dy = dragging ? drag.dStrip * STEP : 0
            const isSelected = selected?.kind === 'part' && selected.id === part.placement_id
            const body = part.body ? boxRect(part.body, view) : null
            const first = part.pins[0]
            return (
              <g
                key={part.placement_id}
                transform={`translate(${dx} ${dy})`}
                className={cn(
                  selecting && !readOnly && 'cursor-grab',
                  dragging && 'cursor-grabbing',
                )}
                onPointerDown={(e) => onPartDown(e, part)}
              >
                {body && (
                  <rect
                    {...body}
                    rx={4}
                    className={cn(
                      isSelected ? 'stroke-primary' : 'stroke-foreground/60',
                      flipped ? 'fill-transparent' : 'fill-foreground/10',
                    )}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={part.mount === 'socketed' ? '6 3' : undefined}
                    opacity={flipped ? 0.4 : 1}
                  />
                )}
                {part.pins.map((pin) => {
                  const net = netOf.get(pin.key)
                  const lit = highlight.pins.has(pin.key)
                  return (
                    <circle
                      key={pin.key}
                      cx={holeX(pin.hole, view)}
                      cy={stripY(pin.strip)}
                      r={lit ? 7 : 5}
                      fill={net ? netColor(net) : 'oklch(0.55 0.02 260)'}
                      className={cn(lit ? 'stroke-status-red' : 'stroke-background')}
                      strokeWidth={lit ? 3 : 1.5}
                    >
                      <title>
                        {pin.key} at {pin.at}
                        {net ? ` · ${net}` : ' · not wired'}
                      </title>
                    </circle>
                  )
                })}
                {(body || first) && (
                  <text
                    x={body ? body.x + 4 : holeX(first.hole, view) + 7}
                    y={body ? body.y + 12 : stripY(first.strip) - 7}
                    fontSize={11}
                    className={cn(
                      'pointer-events-none font-mono font-semibold',
                      isSelected ? 'fill-primary' : 'fill-foreground',
                    )}
                    opacity={flipped ? 0.5 : 1}
                  >
                    {part.ref}
                  </text>
                )}
              </g>
            )
          })}
          {/* Connectors. */}
          {layout.connectors
            .filter((c) => c.strip != null)
            .map((c) => {
              const dragging = drag?.kind === 'connector' && drag.id === c.id
              const dx = dragging ? drag.dHole * STEP * (flipped ? -1 : 1) : 0
              const dy = dragging ? drag.dStrip * STEP : 0
              const isSelected = selected?.kind === 'connector' && selected.id === c.id
              return (
                <g
                  key={c.id}
                  transform={`translate(${dx} ${dy})`}
                  onPointerDown={(e) => onConnectorDown(e, c)}
                  className={cn(selecting && !readOnly && 'cursor-grab')}
                >
                  {c.pins.map(
                    (p) =>
                      p.strip != null &&
                      p.hole != null && (
                        <rect
                          key={p.index}
                          x={holeX(p.hole, view) - STEP * 0.45}
                          y={stripY(p.strip) - STEP * 0.45}
                          width={STEP * 0.9}
                          height={STEP * 0.9}
                          rx={2}
                          className={cn(
                            'fill-foreground/15',
                            isSelected ? 'stroke-primary' : 'stroke-foreground/70',
                          )}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                        >
                          <title>
                            {c.ref} pin {p.index}: {p.pin ?? 'nothing'}
                          </title>
                        </rect>
                      ),
                  )}
                  {c.pins[0]?.strip != null && c.pins[0]?.hole != null && (
                    <text
                      x={holeX(c.pins[0].hole, view) + 6}
                      y={stripY(c.pins[0].strip) - 9}
                      fontSize={10}
                      className="pointer-events-none fill-foreground font-mono font-semibold"
                    >
                      {c.ref}
                    </text>
                  )}
                </g>
              )
            })}
          {/* Top jumpers, over the parts. */}
          {layout.jumpers
            .filter((j) => j.side === 'top')
            .map((j) => (
              <JumperLine
                key={j.id}
                jumper={j}
                view={view}
                color={j.color}
                opacity={flipped ? 0.3 : 0.95}
                selected={selected?.kind === 'jumper' && selected.id === j.id}
                selectable={selecting}
                onPointerDown={(e) => onJumperDown(e, j.id)}
                label={`Jumper ${j.a} → ${j.b}`}
              />
            ))}
          {/* Ratsnest: what the board doesn't join yet. */}
          {layout.links.map((link, i) => (
            <line
              key={i}
              x1={holeX(link.a_hole, view)}
              y1={stripY(link.a_strip)}
              x2={holeX(link.b_hole, view)}
              y2={stripY(link.b_strip)}
              stroke={netColor(link.net)}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              className="pointer-events-none"
            />
          ))}
          {/* The tools' previews. */}
          {tool === 'cut' && hover && (
            <CutGhost target={cutTarget(hover.x, hover.y, view)} view={view} />
          )}
          {tool === 'jumper' && jumperStart && (
            <g className="pointer-events-none">
              <circle
                cx={holeX(jumperStart.hole, view)}
                cy={stripY(jumperStart.strip)}
                r={6}
                className="fill-primary stroke-background"
                strokeWidth={2}
              />
              {hoverCell && (
                <line
                  x1={holeX(jumperStart.hole, view)}
                  y1={stripY(jumperStart.strip)}
                  x2={holeX(hoverCell.hole, view)}
                  y2={stripY(hoverCell.strip)}
                  className="stroke-primary"
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.6}
                />
              )}
            </g>
          )}
          {tool === 'jumper' && !jumperStart && hoverCell && (
            <circle
              cx={holeX(hoverCell.hole, view)}
              cy={stripY(hoverCell.strip)}
              r={6}
              className="pointer-events-none fill-primary/40 stroke-primary"
            />
          )}
          {tool === 'connector' &&
            connectorPreview &&
            hoverCell &&
            Array.from({ length: connectorPreview.pins }, (_, i) => {
              const [along, across] = rotate(
                i * connectorPreview.step,
                0,
                connectorPreview.rotation,
              )
              return (
                <rect
                  key={i}
                  x={holeX(hoverCell.hole + Math.round(along), view) - STEP * 0.45}
                  y={stripY(hoverCell.strip + Math.round(across)) - STEP * 0.45}
                  width={STEP * 0.9}
                  height={STEP * 0.9}
                  rx={2}
                  className={cn(
                    'pointer-events-none stroke-primary',
                    i === 0 ? 'fill-primary/60' : 'fill-primary/30',
                  )}
                />
              )
            })}
          {/* Where an armed part would land. */}
          {armedPins.map((cell, i) => (
            <circle
              key={i}
              cx={holeX(cell.hole, view)}
              cy={stripY(cell.strip)}
              r={5}
              className="pointer-events-none fill-primary/50 stroke-primary"
            />
          ))}
        </g>
      </svg>
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute right-2 bottom-2 bg-card"
        aria-label="Fit the board"
        title="Fit the board"
        onClick={fit}
      >
        <Maximize />
      </Button>
    </div>
  )
}

function JumperLine({
  jumper,
  view,
  color,
  opacity,
  selected,
  selectable,
  onPointerDown,
  label,
}: {
  jumper: { a_strip: number; a_hole: number; b_strip: number; b_hole: number }
  view: BoardView
  color: string
  opacity: number
  selected: boolean
  selectable: boolean
  onPointerDown: (event: ReactPointerEvent) => void
  label: string
}) {
  const ends = {
    x1: holeX(jumper.a_hole, view),
    y1: stripY(jumper.a_strip),
    x2: holeX(jumper.b_hole, view),
    y2: stripY(jumper.b_strip),
  }
  return (
    <g onPointerDown={onPointerDown} className={cn(selectable && 'cursor-pointer')}>
      {selected && (
        <line {...ends} className="stroke-primary" strokeWidth={9} strokeLinecap="round" />
      )}
      <line {...ends} stroke={color} strokeWidth={4} strokeLinecap="round" opacity={opacity} />
      {/* A wider, invisible line, easier to click. */}
      <line {...ends} stroke="transparent" strokeWidth={12} strokeLinecap="round">
        <title>{label}</title>
      </line>
    </g>
  )
}

/** Where the cut tool would cut: a ring at a hole, or a bar between two. */
function CutGhost({ target, view }: { target: CutTarget; view: BoardView }) {
  const y = stripY(target.strip)
  if (target.between) {
    const x = (holeX(target.hole, view) + holeX(target.hole + 1, view)) / 2
    return (
      <line
        x1={x}
        x2={x}
        y1={y - STEP * 0.45}
        y2={y + STEP * 0.45}
        stroke="oklch(0.6 0.22 25)"
        strokeWidth={3}
        opacity={0.7}
        className="pointer-events-none"
      />
    )
  }
  return (
    <circle
      cx={holeX(target.hole, view)}
      cy={y}
      r={STEP * 0.42}
      fill="none"
      stroke="oklch(0.6 0.22 25)"
      strokeWidth={2}
      strokeDasharray="3 2"
      className="pointer-events-none"
    />
  )
}
