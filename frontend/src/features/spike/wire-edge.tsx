import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
} from '@xyflow/react'
import { memo, useContext } from 'react'
import { WireStyleContext } from './context'
import { useIsLit } from './highlight'
import type { WireColor } from './layout'

/** `a` and `b` are the wire's ends as `ref.PIN`. */
export type WireData = { color: WireColor; a: string; b: string }
export type WireEdgeType = Edge<WireData, 'wire'>

/**
 * A wire drawn as a real wire colour over a contrasting outline, so black wires
 * read in dark mode and white ones in light mode.
 */
function WireEdgeComponent(props: EdgeProps<WireEdgeType>) {
  const style = useContext(WireStyleContext)
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props
  const [path] =
    style === 'bezier'
      ? getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
      : style === 'straight'
        ? getStraightPath({ sourceX, sourceY, targetX, targetY })
        : getSmoothStepPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
            borderRadius: 6,
            offset: 16,
          })
  const color = props.data?.color ?? 'gray'
  const lit = useIsLit(props.data?.a ?? '')
  return (
    <>
      {(lit || props.selected) && (
        <path d={path} fill="none" className="wire-halo" strokeWidth={props.selected ? 10 : 9} />
      )}
      <path d={path} fill="none" className="wire-outline" strokeWidth={5} />
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={16}
        style={{ stroke: `var(--wire-${color})`, strokeWidth: 3 }}
      />
    </>
  )
}

export const WireEdge = memo(WireEdgeComponent)
