import { cn } from 'cn'
import { type ComponentProps, type CSSProperties, type ReactNode, useMemo } from 'react'
import type { PinSide } from '@/api/generated/model'
import { FLAG_MARKS } from '@/features/parts/labels'
import { layoutCard, type PinSlot, type Rotation } from './layout'
import { pinColor, pinTooltip, powerRole, type ShownPin } from './pin-style'

function PinLabel({
  pin,
  side,
  x,
  y,
  lit,
}: {
  pin: ShownPin
  side: PinSide
  x: number
  y: number
  lit: boolean
}) {
  const marks = pin.flags.map((f) => FLAG_MARKS[f]).filter(Boolean)
  const vertical = side === 'top' || side === 'bottom'
  const style: CSSProperties =
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
      title={pinTooltip(pin)}
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

/** A plain pin dot, for cards outside the canvas (the part preview). */
function PinDot({ slot }: { slot: PinSlot<ShownPin> }) {
  const color = pinColor(slot.pin.kind)
  const role = powerRole(slot.pin.kind)
  return (
    <span
      title={pinTooltip(slot.pin)}
      className={cn(
        'absolute size-2.5 -translate-1/2 rounded-full border-2',
        // A supply: filled, with a ring round it. A load: a hollow ring.
        role === 'source' && 'outline-[1.5px] outline-offset-[1.5px]',
        role === 'load' ? 'bg-card' : 'border-card',
      )}
      style={{
        left: slot.x,
        top: slot.y,
        ...(role === 'load' ? { borderColor: color } : { background: color }),
        ...(role === 'source' && { outlineColor: color, outlineStyle: 'solid' }),
      }}
    />
  )
}

type Props<P extends ShownPin> = Omit<ComponentProps<'div'>, 'title'> & {
  /** Top line: the placement's ref on the canvas, the part's name in the preview. */
  title: string
  subtitle?: string
  /** A small mark in the top right corner (on the canvas: the part is on a board). */
  badge?: ReactNode
  pins: P[]
  rotation?: Rotation
  selected?: boolean
  /** Names of highlighted pins. */
  lit?: Set<string>
  /** The canvas draws React Flow handles here; elsewhere a plain dot. */
  renderPin?: (slot: PinSlot<P>, lit: boolean) => ReactNode
}

/**
 * A part as a card: a header and its pins on their sides in header order. The same card
 * is drawn on the canvas and in the part page's preview. Size and pin positions come from
 * layoutCard, so they match what the canvas will show.
 */
export function PartCard<P extends ShownPin>({
  title,
  subtitle,
  pins,
  rotation = 0,
  selected,
  lit,
  renderPin,
  badge,
  className,
  style,
  ...rest
}: Props<P>) {
  const layout = useMemo(
    () => layoutCard({ name: subtitle ?? title, pins }, rotation),
    [subtitle, title, pins, rotation],
  )
  return (
    <div
      {...rest}
      style={{ ...style, width: layout.width, height: layout.height }}
      className={cn(
        // An outline, not a border: it takes no room, so pins sit exactly where
        // layoutCard puts them and wires meet them square.
        'relative rounded-md bg-card text-card-foreground shadow-sm outline-2 -outline-offset-2',
        selected ? 'outline-primary' : 'outline-border',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 px-2 pt-1.5 text-center"
        style={{ top: layout.headerTop }}
      >
        <div className="truncate font-mono text-xs font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>}
      </div>
      {badge && <div className="absolute top-1 right-1">{badge}</div>}
      {layout.slots.map((slot, i) => {
        const on = lit?.has(slot.pin.name) ?? false
        return (
          // By index: names can repeat or be empty while being typed in the pin editor.
          <div key={i}>
            {renderPin ? renderPin(slot, on) : <PinDot slot={slot as PinSlot<ShownPin>} />}
            <PinLabel pin={slot.pin} side={slot.side} x={slot.x} y={slot.y} lit={on} />
          </div>
        )
      })}
    </div>
  )
}
