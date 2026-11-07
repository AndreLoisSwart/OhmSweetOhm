import { cn } from 'cn'
import { ChevronDown, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { useContext } from 'react'
import type { CheckResult, CheckSummary, DesignDetail, Severity } from '@/api/generated/model'
import { plural } from '@/lib/format'
import { HighlightContext } from './canvas/highlight'

const ICON = { error: CircleX, warning: TriangleAlert, note: Info }
const TONE: Record<Severity, string> = {
  error: 'text-status-red',
  warning: 'text-status-amber',
  note: 'text-muted-foreground',
}

/** "1 error · 2 warnings", or nothing when all are zero. Also used on the designs list. */
export function CheckCounts({ summary, className }: { summary: CheckSummary; className?: string }) {
  const parts = (['error', 'warning', 'note'] as const)
    .filter((s) => (summary[s] ?? 0) > 0)
    .map((s) => {
      const Icon = ICON[s]
      return (
        <span key={s} className={cn('flex items-center gap-1', TONE[s])}>
          <Icon className="size-3.5" />
          {plural(summary[s] ?? 0, s)}
        </span>
      )
    })
  if (!parts.length) return null
  return <span className={cn('flex flex-wrap items-center gap-x-3', className)}>{parts}</span>
}

function ResultRow({
  result,
  design,
  onPick,
}: {
  result: CheckResult
  design: DesignDetail
  onPick?: () => void
}) {
  const store = useContext(HighlightContext)
  const Icon = ICON[result.severity]
  const net = design.nets.find((n) => n.name === result.net)
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
        // Highlights the pins it's about, and the rest of their net.
        onClick={() => {
          store.toggle([...new Set([...result.pins, ...(net?.pins ?? [])])])
          onPick?.()
        }}
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[result.severity])} />
        <span className="min-w-0 flex-1">{result.message}</span>
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
          {result.id}
        </span>
      </button>
    </li>
  )
}

/** Under the canvas: a summary line that opens into the list of results. */
export function ChecksBar({
  design,
  open,
  onOpenChange,
  onPick,
}: {
  design: DesignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After a result is picked (its pins are highlighted). */
  onPick?: () => void
}) {
  const { summary, results } = design.checks
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
          <CheckCounts summary={summary} />
        ) : (
          <span className="flex items-center gap-1 text-status-green">
            <CircleCheck className="size-3.5" />
            No problems found
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
          {results.map((result, i) => (
            <ResultRow key={i} result={result} design={design} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  )
}
