import { Bot, RotateCcw, User } from 'lucide-react'
import { useListLayoutRevisions } from '@/api/generated/layouts/layouts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { quietly } from '@/features/designs/use-design-actions'
import { timeAgo } from '@/lib/format'
import type { LayoutActions } from './use-layout-actions'

/** Saved versions of the layout, newest first, each with Restore. */
export function LayoutHistoryDialog({
  layoutId,
  open,
  onOpenChange,
  actions,
  readOnly,
}: {
  layoutId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: LayoutActions
  readOnly: boolean
}) {
  const { data: revisions, isPending } = useListLayoutRevisions(layoutId, {
    query: { enabled: open },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Layout history</DialogTitle>
          <DialogDescription>
            Each version is the board as it was before the change described. Restoring saves the
            current board first, so a restore can be undone too.
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : revisions?.length ? (
          <ul className="divide-y">
            {revisions.map((revision) => {
              const Who = revision.author === 'claude' ? Bot : User
              return (
                <li key={revision.id} className="flex items-start gap-3 py-2.5">
                  <Who className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{revision.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      {timeAgo(revision.created_at)} ·{' '}
                      {revision.author === 'claude' ? 'Claude' : 'You'}
                    </div>
                  </div>
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        quietly(actions.restore(revision.id).then(() => onOpenChange(false)))
                      }
                    >
                      <RotateCcw />
                      Restore
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No saved versions yet. One is kept when you start editing after ten minutes away, and
            before every change Claude makes.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
