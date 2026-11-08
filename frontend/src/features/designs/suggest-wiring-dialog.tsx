import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/fetcher'
import { useSuggestWiring } from '@/api/generated/designs/designs'
import type { DesignDetail, SuggestedWire } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BoardPicker } from './firmware-files'
import { useBoard } from './use-board'
import { type DesignActions, quietly } from './use-design-actions'

const wireKey = (w: SuggestedWire) => `${w.a}→${w.b}`

/**
 * Proposed wires for a placed part's unwired pins (the pin assignment helper). The user
 * ticks the ones they want; they're added as one undo step.
 */
export function SuggestWiringDialog({
  design,
  placementRef,
  actions,
  open,
  onOpenChange,
}: {
  design: DesignDetail
  placementRef: string
  actions: DesignActions
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { boards: allBoards, board, setBoard } = useBoard(design)
  const boards = allBoards.filter((ref) => ref !== placementRef)
  const chosen = board === placementRef ? boards[0] : board
  const { data, error, isPending } = useSuggestWiring(
    design.id,
    { ref: placementRef, ...(chosen && { board: chosen }) },
    { query: { enabled: open, staleTime: 0, gcTime: 0 } },
  )
  // Unticked wires, by key: everything starts ticked.
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const wanted = (data?.wires ?? []).filter((w) => !skipped.has(wireKey(w)))

  const toggle = (key: string) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const add = () => {
    setAdding(true)
    quietly(
      actions
        .connect(wanted.map(({ a, b }) => ({ a, b })))
        .then(() => {
          toast.success(`Added ${wanted.length} wire${wanted.length === 1 ? '' : 's'}`)
          onOpenChange(false)
          setSkipped(new Set())
        })
        .finally(() => setAdding(false)),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90svh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Suggested wiring for <span className="font-mono">{placementRef}</span>
          </DialogTitle>
          <DialogDescription>
            Free board pins that suit each unwired pin: buses shared with parts already on them, a
            supply in the part&apos;s range, and GPIOs away from flash, strapping and input-only
            pins. Untick any you don&apos;t want.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 content-start gap-3 overflow-y-auto">
          <BoardPicker boards={boards} board={chosen} onChange={setBoard} />
          {isPending && <p className="text-sm text-muted-foreground">Working it out…</p>}
          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage(error)}
            </p>
          )}
          {data && data.wires.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to suggest.</p>
          )}
          {data && data.wires.length > 0 && (
            <ul className="grid gap-1">
              {data.wires.map((wire) => {
                const key = wireKey(wire)
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={!skipped.has(key)}
                        onChange={() => toggle(key)}
                      />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-mono text-sm">
                          {wire.a} → {wire.b}
                        </span>
                        <span className="text-xs text-muted-foreground">{wire.reason}</span>
                        {wire.warning && (
                          <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                            <TriangleAlert className="mt-px size-3.5 shrink-0" />
                            {wire.warning}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {data && data.unassigned.length > 0 && (
            <div className="grid gap-1">
              <h3 className="text-xs font-medium text-muted-foreground">Left for you</h3>
              <ul className="grid gap-0.5 text-xs">
                {data.unassigned.map((u) => (
                  <li key={u.pin} className="px-2">
                    <span className="font-mono">{u.pin}</span>
                    <span className="text-muted-foreground">: {u.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!wanted.length || adding} onClick={add}>
            Add {wanted.length} wire{wanted.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
