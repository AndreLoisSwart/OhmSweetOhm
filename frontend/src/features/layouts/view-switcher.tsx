import { ChevronDown, CircuitBoard, Plus, Workflow } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateLayout, useListLayouts } from '@/api/generated/layouts/layouts'
import type { BoardType, LayoutSummary } from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

/** "2 to join · 1 error", or "Matches" — a layout's state at a glance. */
function layoutState(layout: LayoutSummary): string {
  const bits = []
  if (layout.stats.missing) bits.push(`${layout.stats.missing} to join`)
  const errors = layout.check_summary.error ?? 0
  if (errors) bits.push(`${errors} error${errors === 1 ? '' : 's'}`)
  if (!bits.length && !layout.stats.on_board) return 'Empty'
  return bits.join(' · ') || 'Matches the design'
}

const BOARDS: { type: BoardType; label: string; size: string }[] = [
  { type: 'stripboard', label: 'Stripboard', size: '24 strips × 37 holes' },
  { type: 'breadboard', label: 'Breadboard pattern', size: '14 rows × 62 holes' },
]

function NewLayoutDialog({
  designId,
  count,
  open,
  onOpenChange,
}: {
  designId: number
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [type, setType] = useState<BoardType>('stripboard')
  const [name, setName] = useState('')
  const create = useCreateLayout()
  const fallback = `${BOARDS.find((b) => b.type === type)!.label} v${count + 1}`
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(
      { designId, data: { name: name.trim() || fallback, board_type: type } },
      {
        onSuccess: (layout) => {
          onOpenChange(false)
          setName('')
          navigate(`/designs/${designId}/layouts/${layout.id}`)
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New board layout</DialogTitle>
            <DialogDescription>
              Lay this design&apos;s parts out on a protoboard. The design stays the same; the
              layout is checked against it.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            Board
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as BoardType)}>
              {BOARDS.map((b) => (
                <option key={b.type} value={b.type}>
                  {b.label} ({b.size})
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={fallback} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * In the design header: the schematic or one of the design's board layouts, and New
 * layout. Each layout shows its state, so a schematic edit that breaks a board is seen.
 */
export function ViewSwitcher({
  designId,
  current,
  readOnly,
}: {
  designId: number
  /** The open layout's id, or null for the schematic. */
  current: number | null
  readOnly?: boolean
}) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { data: layouts = [] } = useListLayouts(designId, {
    query: { refetchInterval: current === null ? 5000 : false },
  })
  const open = layouts.find((l) => l.id === current)
  const Icon = open ? CircuitBoard : Workflow
  const problems = layouts.filter((l) => l.stats.missing || l.check_summary.error).length

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-48 gap-1.5">
            <Icon />
            <span className="truncate">{open ? open.name : 'Schematic'}</span>
            {current === null && problems > 0 && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-status-amber"
                title={`${problems} layout${problems === 1 ? '' : 's'} need attention`}
              />
            )}
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={() => navigate(`/designs/${designId}`)}>
            <Workflow />
            Schematic
          </DropdownMenuItem>
          {layouts.length > 0 && <DropdownMenuSeparator />}
          {layouts.map((layout) => (
            <DropdownMenuItem
              key={layout.id}
              onSelect={() => navigate(`/designs/${designId}/layouts/${layout.id}`)}
            >
              <CircuitBoard />
              <span className="grid min-w-0">
                <span className="truncate">{layout.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {layoutState(layout)}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          {!readOnly && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus />
                New layout…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewLayoutDialog
        designId={designId}
        count={layouts.length}
        open={creating}
        onOpenChange={setCreating}
      />
    </>
  )
}
