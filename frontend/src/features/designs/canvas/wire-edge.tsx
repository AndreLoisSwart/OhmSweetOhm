import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  Position,
  useReactFlow,
} from '@xyflow/react'
import { cn } from 'cn'
import { memo, type PointerEvent, useContext, useEffect, useRef, useState } from 'react'
import { type PinTarget, RoutesContext, WireMoveContext } from './context'
import { FocusContext, focusClass, wireLevel } from './focus'
import { useWireLight } from './highlight'
import type { WireEdgeType } from './model'
import { midpoint, type Point, roundedPath, routeFor } from './routing'

/** How far the pointer moves before a press on a grab zone becomes a drag. */
const DRAG_START = 4
/** How close (screen px) the pointer must be to a pin to drop on it. */
const DROP_RADIUS = 16

/** The pin nearest the pointer, within DROP_RADIUS: its card, handle and centre. */
function pinNear(x: number, y: number): (PinTarget & { at: { x: number; y: number } }) | null {
  let best: (PinTarget & { at: { x: number; y: number } }) | null = null
  let nearest = DROP_RADIUS
  for (const el of document.querySelectorAll<HTMLElement>('.ohm-canvas .react-flow__handle')) {
    const r = el.getBoundingClientRect()
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    const d = Math.hypot(at.x - x, at.y - y)
    const nodeId = el.dataset.nodeid
    const handle = el.dataset.handleid
    if (d < nearest && nodeId && handle) [best, nearest] = [{ nodeId, handle, at }, d]
  }
  return best
}

const OPPOSITE: Record<Position, Position> = {
  [Position.Left]: Position.Right,
  [Position.Right]: Position.Left,
  [Position.Top]: Position.Bottom,
  [Position.Bottom]: Position.Top,
}

/**
 * A wire in its real colour over a contrasting outline, so black wires read in dark mode
 * and white ones in light mode. Follows its route round the cards; while a card is being
 * dragged (the route no longer meets the pins) it falls back to a plain square path.
 *
 * The stretch next to each pin is a grab zone (grab.ts): pressing it and dragging moves
 * that end to another pin (dropped elsewhere, it snaps back); a press without a drag
 * selects the wire as a click anywhere on it does. The pin itself still starts new wires.
 */
function WireEdgeComponent(props: EdgeProps<WireEdgeType>) {
  const { routes, labels, grabs } = useContext(RoutesContext)
  const move = useContext(WireMoveContext)
  const { screenToFlowPosition } = useReactFlow()
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const wire = props.data!.wire
  const light = useWireLight(wire.a, wire.b)
  const level = wireLevel(useContext(FocusContext), props.source, props.target)
  const [hovered, setHovered] = useState<'a' | 'b' | null>(null)
  // The end being dragged and where it is (flow coordinates), snapped to a pin when near.
  const [drag, setDrag] = useState<{ end: 'a' | 'b'; at: Point; onPin: boolean } | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  const route = routeFor(
    routes.get(props.id),
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  )
  const grab = route ? grabs.get(props.id) : undefined

  const startGrab = (end: 'a' | 'b') => (e: PointerEvent<SVGPathElement>) => {
    if (!move || e.button !== 0) return
    const start = { x: e.clientX, y: e.clientY }
    let dragging = false
    const at = (x: number, y: number) => {
      const pin = pinNear(x, y)
      return { pin, at: screenToFlowPosition(pin ? pin.at : { x, y }) }
    }
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_START) return
      dragging = true
      const { pin, at: point } = at(ev.clientX, ev.clientY)
      setDrag({ end, at: point, onPin: !!pin })
    }
    const onUp = (ev: globalThis.PointerEvent) => {
      stop()
      if (!dragging) return // a click: React Flow selects the wire
      const { pin } = at(ev.clientX, ev.clientY)
      setDrag(null)
      if (pin) move(props.id, end, pin)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      stop()
      setDrag(null)
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
      cleanup.current = null
    }
    const cancel = () => {
      stop()
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
    cleanup.current = stop
  }

  // While dragging: the fixed end to the pointer, as a plain square path.
  if (drag) {
    const fixed =
      drag.end === 'a'
        ? { x: targetX, y: targetY, position: targetPosition }
        : { x: sourceX, y: sourceY, position: sourcePosition }
    const [path] = getSmoothStepPath({
      sourceX: fixed.x,
      sourceY: fixed.y,
      sourcePosition: fixed.position,
      targetX: drag.at.x,
      targetY: drag.at.y,
      targetPosition: OPPOSITE[fixed.position],
      borderRadius: 6,
      offset: 20,
    })
    return (
      <g className="wire-dragging">
        <path d={path} fill="none" className="wire-halo" strokeWidth={9} />
        <path d={path} fill="none" className="wire-outline" strokeWidth={5} />
        <path
          d={path}
          fill="none"
          style={{ stroke: `var(--wire-${wire.color})`, strokeWidth: 3 }}
          strokeDasharray={drag.onPin ? undefined : '6 4'}
        />
      </g>
    )
  }

  let path: string
  let labelAt: { x: number; y: number }
  if (route) {
    path = roundedPath(route)
    labelAt = labels.get(props.id) ?? midpoint(route)
  } else {
    const [smooth, x, y] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 6,
      offset: 20,
    })
    path = smooth
    labelAt = { x, y }
  }

  return (
    <g className={focusClass(level)}>
      {(light === 'lit' || props.selected) && (
        <path d={path} fill="none" className="wire-halo" strokeWidth={props.selected ? 10 : 9} />
      )}
      {light === 'traced' && !props.selected && (
        <path d={path} fill="none" className="wire-halo-traced" strokeWidth={9} />
      )}
      <path d={path} fill="none" className="wire-outline" strokeWidth={5} />
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={18}
        style={{ stroke: `var(--wire-${wire.color})`, strokeWidth: 3 }}
      />
      {move &&
        grab &&
        (['a', 'b'] as const).map((end) => {
          const zone = grab[end]
          if (!zone) return null
          const d = roundedPath(zone, 0)
          return (
            <g key={end}>
              {hovered === end && (
                <path d={d} fill="none" className="wire-grab-cue" strokeWidth={9} />
              )}
              <path
                d={d}
                fill="none"
                className={cn('wire-grab nopan nodrag')}
                strokeWidth={14}
                onPointerDown={startGrab(end)}
                // The pane pans on mousedown/touchstart: keep them from reaching it.
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onPointerEnter={() => setHovered(end)}
                onPointerLeave={() => setHovered(null)}
              />
            </g>
          )
        })}
      {wire.label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan pointer-events-none absolute rounded border bg-card px-1 font-mono text-[10px] text-muted-foreground',
              focusClass(level),
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}
          >
            {wire.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

export const WireEdge = memo(WireEdgeComponent)
