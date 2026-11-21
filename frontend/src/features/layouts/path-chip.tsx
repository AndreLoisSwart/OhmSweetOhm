import { cn } from 'cn'
import { Route, X } from 'lucide-react'
import type { LayoutDetail } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import { type Cell } from './board/geometry'
import { describePath, endAt, type PathResult } from './board/path'

/** Under the toolbar while tracing a path: what was found, or what to click next. */
export function PathChip({
  layout,
  start,
  waiting,
  path,
  onClear,
}: {
  layout: LayoutDetail
  /** The first end, before the second is picked. */
  start: Cell | null
  waiting: boolean
  path: PathResult | null
  onClear: () => void
}) {
  let text: string
  let tone: 'ok' | 'short' | 'open' | 'start' = 'start'
  if (path) {
    const found = describePath(path, layout.board_type)
    text = found.text
    tone = found.tone
  } else if (start) {
    const end = endAt(layout, start)
    text = `From ${end.pin ? `${end.pin} (${end.at})` : end.at}: ${
      waiting ? 'click' : 'Shift-click'
    } the other end`
  } else return null
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex max-w-[min(36rem,100%)] items-center gap-1.5 rounded-md border bg-card py-0.5 pr-0.5 pl-2 text-xs shadow-sm',
        tone === 'short' && 'border-status-red text-status-red',
        tone === 'open' && 'text-muted-foreground',
      )}
    >
      <Route className="size-3.5 shrink-0" />
      <span className="truncate" title={text}>
        {text}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0"
        aria-label="Stop tracing (Esc)"
        title="Stop tracing (Esc)"
        onClick={onClear}
      >
        <X />
      </Button>
    </div>
  )
}
