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
import { parseOptionalId } from '@/features/parts/fields'
import { BOARDS, isFixed } from './boards'
import { PitchPicker } from './pitch-picker'

/** "2 to join · 1 error", or "Matches" — a layout's state at a glance. */
function layoutState(layout: LayoutSummary): string {
  const bits = []
  if (layout.stats.missing) bits.push(`${layout.stats.missing} to join`)
  const errors = layout.check_summary.error ?? 0
  if (errors) bits.push(`${errors} error${errors === 1 ? '' : 's'}`)
  if (!bits.length && !layout.stats.on_board) return 'Empty'
  return bits.join(' · ') || 'Matches the design'
}

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
  const [pitch, setPitch] = useState(2.54)
  // Blank means the board's usual size.
  const [strips, setStrips] = useState('')
  const [holes, setHoles] = useState('')
  const [shelf, setShelf] = useState('')
  const create = useCreateLayout()
  const board = BOARDS.find((b) => b.type === type)!
  const fallback = `${board.label} v${count + 1}`
  const shelfId = parseOptionalId(shelf)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if ('error' in shelfId) return
    create.mutate(
      {
        designId,
        data: {
          name: name.trim() || fallback,
          board_type: type,
          ...(!isFixed(type) && { pitch_mm: pitch }),
          // A breadboard pattern always has its 14 rows.
          ...(!isFixed(type) && strips && { strips: Number(strips) }),
          ...(holes && { holes: Number(holes) }),
          shelf_item_id: shelfId.value,
        },
      },
      {
        onSuccess: (layout) => {
          onOpenChange(false)
          setName('')
          setStrips('')
          setHoles('')
          setShelf('')
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
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <div className="grid gap-1 text-sm">
            Size
            <div className="flex items-center gap-2">
              <Input
                aria-label={type === 'stripboard' ? 'Strips' : 'Rows'}
                type="number"
                min={2}
                max={100}
                value={isFixed(type) ? String(board.strips) : strips}
                onChange={(e) => setStrips(e.target.value)}
                placeholder={String(board.strips)}
                disabled={isFixed(type)}
                className="w-20"
              />
              <span className="text-muted-foreground">
                {type === 'stripboard' ? 'strips' : 'rows'} ×
              </span>
              <Input
                aria-label="Holes"
                type="number"
                min={2}
                max={200}
                value={holes}
                onChange={(e) => setHoles(e.target.value)}
                placeholder={String(board.holes)}
                className="w-20"
              />
              <span className="text-muted-foreground">holes</span>
            </div>
          </div>
          {!isFixed(type) && (
            <div className="grid gap-1 text-sm">
              Hole spacing
              <PitchPicker value={pitch} onChange={setPitch} />
              {pitch !== 2.54 && (
                <span className="text-xs text-muted-foreground">
                  Modules with 2.54 mm headers won&apos;t sit on this board as they are.
                </span>
              )}
            </div>
          )}
          <label className="grid gap-1 text-sm">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={fallback} />
          </label>
          <label className="grid gap-1 text-sm">
            Shelf-help item
            <Input
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              inputMode="numeric"
              placeholder="Optional: the board on your shelf"
              aria-invalid={'error' in shelfId}
            />
            {'error' in shelfId && (
              <span className="text-xs text-destructive">{shelfId.error}</span>
            )}
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || 'error' in shelfId}>
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
