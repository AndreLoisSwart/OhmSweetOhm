import { keepPreviousData } from '@tanstack/react-query'
import { useReactFlow } from '@xyflow/react'
import { GripVertical, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { DesignDetail } from '@/api/generated/model'
import { useListParts } from '@/api/generated/parts/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnverifiedBadge } from '@/features/parts/badges'
import { PART_KIND_LABELS } from '@/features/parts/labels'
import { plural } from '@/lib/format'
import { PART_DRAG_TYPE } from './canvas/context'
import { freeSpot, routeInput } from './canvas/model'
import { type DesignActions, quietly } from './use-design-actions'

/**
 * The parts to place: drag one onto the canvas (mouse), or tap + to drop it in the
 * middle of the view (touch, where dragging out of a list isn't practical).
 */
export function LibraryPanel({
  design,
  actions,
  onAdded,
}: {
  design: DesignDetail
  actions: DesignActions
  onAdded?: () => void
}) {
  const [q, setQ] = useState('')
  const { data: parts = [] } = useListParts(
    { q: q || undefined },
    { query: { placeholderData: keepPreviousData } },
  )
  const { screenToFlowPosition } = useReactFlow()

  const addInView = (partId: number) => {
    const canvas = document.querySelector('.ohm-canvas')?.getBoundingClientRect()
    const centre = canvas
      ? screenToFlowPosition({ x: canvas.x + canvas.width / 3, y: canvas.y + canvas.height / 4 })
      : { x: 0, y: 0 }
    // Beside whatever is already there, not on top of it.
    const at = freeSpot(routeInput(design).cards, centre)
    quietly(actions.addParts([{ part_id: partId, ...at }]).then(onAdded))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a part"
          aria-label="Find a part"
          className="pl-8"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {parts.map((part) => (
          <li
            key={part.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PART_DRAG_TYPE, String(part.id))
              e.dataTransfer.effectAllowed = 'copy'
            }}
            className="group flex cursor-grab items-center gap-1 rounded-md py-1.5 pr-1 pl-1 hover:bg-muted/60 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60 max-lg:hidden" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{part.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {PART_KIND_LABELS[part.kind]} · {plural(part.pin_count, 'pin')}
                {!part.verified && <UnverifiedBadge />}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => addInView(part.id)}
              aria-label={`Add ${part.name}`}
              title="Add to the design"
            >
              <Plus />
            </Button>
          </li>
        ))}
        {parts.length === 0 && (
          <li className="px-2 py-4 text-sm text-muted-foreground">
            {q ? (
              'No parts match.'
            ) : (
              <>
                No parts yet.{' '}
                <Link to="/parts" className="underline">
                  Add some
                </Link>{' '}
                first.
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  )
}
