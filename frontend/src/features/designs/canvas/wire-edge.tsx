import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react'
import { memo, useContext } from 'react'
import { RoutesContext } from './context'
import { useIsLit } from './highlight'
import type { WireEdgeType } from './model'
import { midpoint, roundedPath, routeFor } from './routing'

/**
 * A wire in its real colour over a contrasting outline, so black wires read in dark mode
 * and white ones in light mode. Follows its route round the cards; while a card is being
 * dragged (the route no longer meets the pins) it falls back to a plain square path.
 */
function WireEdgeComponent(props: EdgeProps<WireEdgeType>) {
  const routes = useContext(RoutesContext)
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const wire = props.data!.wire
  const lit = useIsLit(wire.a)

  const route = routeFor(
    routes.get(props.id),
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  )
  let path: string
  let labelAt: { x: number; y: number }
  if (route) {
    path = roundedPath(route)
    labelAt = midpoint(route)
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
    <>
      {(lit || props.selected) && (
        <path d={path} fill="none" className="wire-halo" strokeWidth={props.selected ? 10 : 9} />
      )}
      <path d={path} fill="none" className="wire-outline" strokeWidth={5} />
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={18}
        style={{ stroke: `var(--wire-${wire.color})`, strokeWidth: 3 }}
      />
      {wire.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded border bg-card px-1 font-mono text-[10px] text-muted-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${labelAt.x}px, ${labelAt.y}px)` }}
          >
            {wire.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const WireEdge = memo(WireEdgeComponent)
