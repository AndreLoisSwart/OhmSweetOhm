import { cn } from 'cn'
import { ChevronDown, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import type { LayoutCheck, LayoutDetail, Severity } from '@/api/generated/model'
import { CheckCounts } from '@/features/designs/checks-bar'

const ICON = { error: CircleX, warning: TriangleAlert, note: Info }
const TONE: Record<Severity, string> = {
  error: 'text-status-red',
  warning: 'text-status-amber',
  note: 'text-muted-foreground',
}

/**
 * Under the board: a summary line that opens into the layout's checks. Picking one
 * lights up its pins and holes on the board.
 */
export function LayoutChecksBar({
  layout,
  open,
  onOpenChange,
  picked,
  onPick,
}: {
  layout: LayoutDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  picked: LayoutCheck | null
  onPick: (check: LayoutCheck | null) => void
}) {
  const results = layout.checks
  return (
    <div className="shrink-0 border-t bg-background">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-3 px-3 text-sm"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        disabled={!results.length}
      >
        <span className="font-medium">Checks</span>
        {results.length ? (
          <CheckCounts summary={layout.check_summary} />
        ) : layout.stats.on_board + layout.stats.off_board === 0 ? (
          <span className="truncate text-muted-foreground">Nothing on the board yet</span>
        ) : (
          <span className="flex items-center gap-1 truncate text-status-green">
            <CircleCheck className="size-3.5 shrink-0" />
            The board matches the design
          </span>
        )}
        {layout.stats.missing > 0 && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {layout.stats.missing} to join (dashed lines)
          </span>
        )}
        {results.length > 0 && (
          <ChevronDown
            className={cn(
              'ml-auto size-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </button>
      {open && results.length > 0 && (
        <ul className="max-h-[35vh] overflow-y-auto px-1 pb-2">
          {results.map((result, i) => {
            const Icon = ICON[result.severity]
            const active = picked?.message === result.message
            return (
              <li key={i}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    active && 'bg-muted',
                  )}
                  onClick={() => onPick(active ? null : result)}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[result.severity])} />
                  <span className="min-w-0 flex-1">{result.message}</span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                    {result.id}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
