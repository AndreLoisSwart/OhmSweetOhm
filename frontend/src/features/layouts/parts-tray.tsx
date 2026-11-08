import { cn } from 'cn'
import { Cable, CircleAlert, Hand, MousePointerClick, Plug } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { LayoutCheck, LayoutDetail } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { PLACEMENT_MIME } from './board/highlight'
import { quietly } from '@/features/designs/use-design-actions'
import type { LayoutActions } from './use-layout-actions'

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="px-2 text-xs font-medium text-muted-foreground">
        {title} <span className="tabular-nums">({count})</span>
      </h3>
      {count > 0 ? (
        <ul className="grid gap-0.5">{children}</ul>
      ) : (
        <p className="px-2 text-xs text-muted-foreground/70">None</p>
      )}
    </section>
  )
}

/**
 * The design's parts, grouped by where they are in this layout: not placed yet, on the
 * board, off the board. Drag one onto the board, or arm it with a tap and tap the board
 * (touch). Off-board parts list the pins still needing a connector.
 */
export function PartsTray({
  layout,
  actions,
  armed,
  onArm,
  selected,
  onSelect,
  onAddConnector,
  readOnly,
}: {
  layout: LayoutDetail
  actions: LayoutActions
  armed: number | null
  onArm: (placementId: number | null) => void
  selected: number | null
  onSelect: (placementId: number) => void
  /** Make a connector carrying these off-board pins, in order. */
  onAddConnector: (pins: string[]) => void
  readOnly: boolean
}) {
  const onBoard = layout.parts.filter((p) => p.on_board)
  const offBoard = layout.parts.filter((p) => !p.on_board)
  const needs = new Map<string, string[]>()
  for (const check of layout.checks.filter((c: LayoutCheck) => c.id === 'off_board_unconnected'))
    if (check.pins[0]) needs.set(check.pins[0].split('.')[0], check.pins)

  return (
    <div className="grid content-start gap-4 overflow-y-auto p-2">
      <Group title="Not placed yet" count={layout.not_placed.length}>
        {layout.not_placed.map((p) => (
          <li
            key={p.placement_id}
            draggable={!readOnly && p.has_footprint}
            onDragStart={(event) => {
              event.dataTransfer.setData(PLACEMENT_MIME, String(p.placement_id))
              event.dataTransfer.effectAllowed = 'move'
            }}
            className={cn(
              'grid gap-1 rounded-md border px-2 py-1.5 text-sm',
              p.has_footprint && !readOnly && 'cursor-grab',
              armed === p.placement_id && 'border-primary bg-primary/10',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{p.ref}</span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{p.part_name}</span>
            </div>
            {p.has_footprint ? (
              !readOnly && (
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={armed === p.placement_id ? 'secondary' : 'ghost'}
                    size="xs"
                    onClick={() => onArm(armed === p.placement_id ? null : p.placement_id)}
                    title="Then click the board where its first pin goes"
                  >
                    <MousePointerClick />
                    {armed === p.placement_id ? 'Click the board…' : 'Place'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      quietly(actions.place([{ placement_id: p.placement_id, on_board: false }]))
                    }
                  >
                    <Cable />
                    Off board
                  </Button>
                </div>
              )
            ) : (
              <div className="flex flex-wrap items-center gap-1 text-xs text-status-amber">
                <CircleAlert className="size-3.5" />
                No footprint:
                <Link to={`/parts/${p.part_id}`} className="underline underline-offset-2">
                  add one
                </Link>
                {!readOnly && (
                  <>
                    or
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() =>
                        quietly(actions.place([{ placement_id: p.placement_id, on_board: false }]))
                      }
                    >
                      keep it off board
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </Group>
      <Group title="On the board" count={onBoard.length}>
        {onBoard.map((p) => (
          <li key={p.placement_id}>
            <button
              type="button"
              onClick={() => onSelect(p.placement_id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
                selected === p.placement_id && 'bg-muted',
              )}
            >
              <span className="font-mono font-medium">{p.ref}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {p.part_name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{p.at}</span>
            </button>
          </li>
        ))}
      </Group>
      <Group title="Off the board" count={offBoard.length}>
        {offBoard.map((p) => {
          const missing = needs.get(p.ref) ?? []
          return (
            <li key={p.placement_id}>
              <button
                type="button"
                onClick={() => onSelect(p.placement_id)}
                className={cn(
                  'grid w-full gap-0.5 rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
                  selected === p.placement_id && 'bg-muted',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono font-medium">{p.ref}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {p.part_name}
                  </span>
                </span>
                {missing.length > 0 && (
                  <span className="text-xs text-status-amber">
                    Needs a connector: {missing.map((k) => k.split('.')[1]).join(', ')}
                  </span>
                )}
              </button>
              {missing.length > 0 && !readOnly && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-1"
                  onClick={() => onAddConnector(missing)}
                  title="A header carrying these pins in order; then click where pin 1 goes"
                >
                  <Plug />
                  Add a {missing.length}-pin connector
                </Button>
              )}
            </li>
          )
        })}
      </Group>
      {!readOnly && (
        <p className="flex gap-1.5 px-2 text-xs text-muted-foreground">
          <Hand className="mt-px size-3.5 shrink-0" />
          Drag a part onto the board, or press Place and click where its first pin goes (R turns it
          first). Drag parts to move them; R turns the selected one.
        </p>
      )}
    </div>
  )
}
