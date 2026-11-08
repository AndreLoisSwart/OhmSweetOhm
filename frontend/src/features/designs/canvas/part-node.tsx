import { Handle, type NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react'
import { cn } from 'cn'
import { memo, useContext, useEffect } from 'react'
import type { PinSide } from '@/api/generated/model'
import { pinColorGroup, pinKey, type Rotation } from '@/features/parts/card/layout'
import { PartCard } from '@/features/parts/card/part-card'
import { pinTooltip, powerRole } from '@/features/parts/card/pin-style'
import { PinEventsContext } from './context'
import { cardLevel, FocusContext, focusClass } from './focus'
import { useHighlightedPins } from './highlight'
import type { PartNodeType } from './model'

const POSITION: Record<PinSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

function PartNodeComponent({ id, data, selected }: NodeProps<PartNodeType>) {
  const { placement, part } = data
  const lit = useHighlightedPins(placement.ref)
  const events = useContext(PinEventsContext)
  const level = cardLevel(useContext(FocusContext), id)
  const updateNodeInternals = useUpdateNodeInternals()

  // Handles move when the card rotates or its pins change; React Flow must re-measure.
  // Keyed on what places the pins, not on the pin list itself: every answer from the
  // server brings a new copy of it, and re-measuring every card after each change was
  // what shifted wire ends.
  const layoutKey = part.pins.map((p) => `${p.name}:${p.side}:${p.position}`).join('|')
  useEffect(() => updateNodeInternals(id), [id, placement.rotation, layoutKey, updateNodeInternals])

  const pinAt = (target: EventTarget) =>
    (target as HTMLElement).closest<HTMLElement>('[data-pin], [data-handleid]')
  const keyOf = (el: HTMLElement) => pinKey(placement.ref, el.dataset.pin ?? el.dataset.handleid!)

  return (
    <PartCard
      title={placement.ref}
      subtitle={part.name}
      pins={part.pins}
      rotation={placement.rotation as Rotation}
      selected={selected}
      lit={lit}
      // Unverified parts get a dashed edge, a hint to check their pinout.
      className={cn(!part.verified && 'outline-dashed', focusClass(level))}
      renderPin={({ pin, side, x, y }, on) => (
        <Handle
          id={pin.name}
          type="source"
          position={POSITION[side]}
          title={pinTooltip(pin)}
          className={cn(
            'pin-handle',
            `pin-${pinColorGroup(pin.kind)}`,
            powerRole(pin.kind) && `pin-${powerRole(pin.kind)}`,
            on && 'pin-lit',
          )}
          style={{ left: x, top: y, right: 'auto', bottom: 'auto' }}
        />
      )}
      // Delegated pin events: one listener per card instead of two per pin.
      onPointerOver={(e) => {
        if (e.pointerType !== 'mouse') return
        const el = pinAt(e.target)
        events.hover(el ? keyOf(el) : null)
      }}
      onPointerLeave={(e) => e.pointerType === 'mouse' && events.hover(null)}
      onClickCapture={(e) => {
        const el = pinAt(e.target)
        if (el) events.tap(keyOf(el))
      }}
    />
  )
}

export const PartNode = memo(PartNodeComponent)
