import { Handle, type Node, type NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react'
import { cn } from 'cn'
import { memo, useContext, useEffect, useMemo } from 'react'
import { PinEventsContext } from './context'
import { useHighlightedPins } from './highlight'
import { layoutCard, pinColorGroup, pinKey, type Rotation } from './layout'
import type { Part, Pin, PinFlag, Side } from './parts'

export type PartNodeData = { ref: string; part: Part; rotation: Rotation }
export type PartNodeType = Node<PartNodeData, 'part'>

const POSITION: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

/** Flags worth a mark on the card; the rest show in the pin's tooltip. */
const FLAG_MARKS: Partial<Record<PinFlag, string>> = {
  input_only: 'I',
  strapping: 'S',
  flash: 'F',
}

const tooltip = (pin: Pin) =>
  [
    `${pin.name} — ${pin.kind}`,
    pin.functions.length ? `also: ${pin.functions.join(', ')}` : '',
    pin.voltage !== null ? `${pin.voltage} V` : '',
    pin.flags.length ? `flags: ${pin.flags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

function PinLabel({
  pin,
  side,
  x,
  y,
  lit,
}: {
  pin: Pin
  side: Side
  x: number
  y: number
  lit: boolean
}) {
  const marks = pin.flags.map((f) => FLAG_MARKS[f]).filter(Boolean)
  const vertical = side === 'top' || side === 'bottom'
  const style: React.CSSProperties =
    side === 'left'
      ? { left: x + 9, top: y, transform: 'translateY(-50%)' }
      : side === 'right'
        ? { right: 9, top: y, transform: 'translateY(-50%)' }
        : side === 'top'
          ? { left: x, top: 9, transform: 'translateX(-50%)' }
          : { left: x, bottom: 9, transform: 'translateX(-50%) rotate(180deg)' }
  return (
    <span
      data-pin={pin.name}
      title={tooltip(pin)}
      style={style}
      className={cn(
        'absolute flex items-center gap-0.5 rounded-sm px-0.5 font-mono text-[11px] leading-4 whitespace-nowrap',
        vertical && '[writing-mode:vertical-rl]',
        side === 'right' && 'flex-row-reverse',
        lit ? 'bg-primary text-primary-foreground' : 'text-foreground',
      )}
    >
      {pin.name}
      {marks.map((m) => (
        <span
          key={m}
          className={cn(
            'rounded-[3px] border px-[2px] text-[8px] leading-3 font-semibold',
            lit ? 'border-primary-foreground/60' : 'border-status-amber text-status-amber',
          )}
        >
          {m}
        </span>
      ))}
    </span>
  )
}

function PartNodeComponent({ id, data, selected }: NodeProps<PartNodeType>) {
  const { ref, part, rotation } = data
  const layout = useMemo(() => layoutCard(part, rotation), [part, rotation])
  const lit = useHighlightedPins(ref)
  const events = useContext(PinEventsContext)
  const updateNodeInternals = useUpdateNodeInternals()

  // Handles move when the card rotates; React Flow must re-measure them.
  useEffect(() => updateNodeInternals(id), [id, rotation, updateNodeInternals])

  const pinAt = (target: EventTarget) =>
    (target as HTMLElement).closest<HTMLElement>('[data-pin], [data-handleid]')
  const keyOf = (el: HTMLElement) => pinKey(ref, el.dataset.pin ?? el.dataset.handleid!)

  return (
    <div
      style={{ width: layout.width, height: layout.height }}
      className={cn(
        'relative rounded-md border-2 bg-card text-card-foreground shadow-sm',
        selected ? 'border-primary' : 'border-border',
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
    >
      <div
        className="pointer-events-none absolute inset-x-0 px-2 pt-1.5 text-center"
        style={{ top: layout.headerTop }}
      >
        <div className="font-mono text-xs font-semibold">{ref}</div>
        <div className="truncate text-[10px] text-muted-foreground">{part.name}</div>
      </div>
      {layout.slots.map(({ pin, side, x, y }) => {
        const on = lit.has(pin.name)
        return (
          <div key={pin.name}>
            <Handle
              id={pin.name}
              type="source"
              position={POSITION[side]}
              title={tooltip(pin)}
              className={cn('pin-handle', `pin-${pinColorGroup(pin.kind)}`, on && 'pin-lit')}
              style={{ left: x, top: y, right: 'auto', bottom: 'auto' }}
            />
            <PinLabel pin={pin} side={side} x={x} y={y} lit={on} />
          </div>
        )
      })}
    </div>
  )
}

export const PartNode = memo(PartNodeComponent)
