import { Bot, RotateCcw, User } from 'lucide-react'
import { useListRevisions } from '@/api/generated/designs/designs'
import type { RevisionOut } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { plural, timeAgo } from '@/lib/format'
import { type DesignActions, quietly } from './use-design-actions'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function RevisionRow({
  revision,
  onRestore,
  readOnly,
}: {
  revision: RevisionOut
  onRestore: () => void
  readOnly: boolean
}) {
  const Who = revision.author === 'claude' ? Bot : User
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Who className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{revision.summary}</div>
        <div className="text-xs text-muted-foreground">
          <span title={when(revision.created_at)}>{timeAgo(revision.created_at)}</span>
          {' · '}
          {revision.author === 'claude' ? 'Claude' : 'You'}
          {' · '}
          {plural(revision.part_count, 'part')}, {plural(revision.wire_count, 'wire')}
        </div>
      </div>
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={onRestore}>
          <RotateCcw />
          Restore
        </Button>
      )}
    </li>
  )
}

/** Saved versions of the design, newest first, each with Restore. */
export function HistoryDialog({
  designId,
  open,
  onOpenChange,
  actions,
  readOnly,
}: {
  designId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: DesignActions
  readOnly: boolean
}) {
  const { data: revisions, isPending } = useListRevisions(designId, {
    query: { enabled: open },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>
            Each version is the design as it was before the change described. Restoring saves the
            current design first, so a restore can be undone too.
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : revisions?.length ? (
          <ul className="divide-y">
            {revisions.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                readOnly={readOnly}
                onRestore={() =>
                  quietly(actions.restore(revision.id).then(() => onOpenChange(false)))
                }
              />
            ))}
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
