import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from 'cn'
import { ClipboardPaste, GripVertical, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PartDetail, PinFlag, PinKind, PinSide } from '@/api/generated/model'
import { useReplacePins } from '@/api/generated/parts/parts'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { pinColor } from '@/features/parts/card/pin-style'
import {
  PIN_FLAG_LABELS,
  PIN_FLAG_SHORT,
  PIN_FLAGS,
  PIN_KIND_LABELS,
  PIN_KINDS,
  PIN_SIDE_LABELS,
  PIN_SIDES,
} from '@/features/parts/labels'
import { type DraftPin, fromPins, newPin, pinErrors, toPinsIn, withPositions } from './draft'
import { PastePinsDialog } from './paste-pins-dialog'
import { PartPreview } from './part-preview'

type Change = (key: string, change: Partial<DraftPin>) => void

function CheckList<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string
  options: T[]
  labels: Record<T, string>
  value: T[]
  onChange: (value: T[]) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="grid gap-0.5">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={value.includes(option)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, option] : value.filter((v) => v !== option))
              }
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Alternate roles, flags and the Wokwi name: less used, so behind a button. */
function PinDetails({ pin, onChange }: { pin: DraftPin; onChange: Change }) {
  const count = pin.functions.length + pin.flags.length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-full min-w-0 shrink justify-start gap-1 px-1.5 font-normal text-muted-foreground"
          aria-label={`Roles and flags of ${pin.name || 'this pin'}`}
        >
          <SlidersHorizontal />
          {count === 0 ? (
            <span className="hidden sm:inline">Roles, flags</span>
          ) : (
            <span className="truncate">
              {[
                ...pin.functions.map((f) => PIN_KIND_LABELS[f]),
                ...pin.flags.map((f) => PIN_FLAG_SHORT[f]),
              ].join(', ')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)]">
        <div className="grid grid-cols-2 gap-4">
          <CheckList<PinKind>
            legend="Also works as"
            options={PIN_KINDS.filter((k) => k !== pin.kind && k !== 'nc')}
            labels={PIN_KIND_LABELS}
            value={pin.functions}
            onChange={(functions) => onChange(pin.key, { functions })}
          />
          <div className="grid content-start gap-4">
            <CheckList<PinFlag>
              legend="Flags"
              options={PIN_FLAGS}
              labels={PIN_FLAG_LABELS}
              value={pin.flags}
              onChange={(flags) => onChange(pin.key, { flags })}
            />
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Wokwi pin name
              <Input
                value={pin.wokwi_name ?? ''}
                onChange={(e) => onChange(pin.key, { wokwi_name: e.target.value || null })}
                placeholder="Same as the name"
                className="font-mono"
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PinRow({
  pin,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  pin: DraftPin
  error?: string
  onChange: Change
  onMove: (key: string, side: PinSide) => void
  onRemove: (key: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pin.key })
  const label = pin.name || 'new pin'
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('rounded-md bg-background py-1', isDragging && 'relative z-10 shadow-md')}
    >
      <div className="flex items-center gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Move ${label}`}
        >
          <GripVertical className="size-4" />
        </button>
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: pinColor(pin.kind) }}
          aria-hidden
        />
        <Input
          value={pin.name}
          onChange={(e) => onChange(pin.key, { name: e.target.value })}
          aria-label="Pin name"
          aria-invalid={Boolean(error)}
          title={error}
          placeholder="Name"
          className="w-24 font-mono sm:w-28"
        />
        <NativeSelect
          value={pin.kind}
          onChange={(e) =>
            onChange(pin.key, {
              kind: e.target.value as PinKind,
              // A role can't also be listed as an alternate.
              functions: pin.functions.filter((f) => f !== e.target.value),
            })
          }
          aria-label={`Kind of ${label}`}
          className="w-28 sm:w-32"
        >
          {PIN_KINDS.map((k) => (
            <option key={k} value={k}>
              {PIN_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          value={pin.voltage ?? ''}
          onChange={(e) =>
            onChange(pin.key, { voltage: e.target.value === '' ? null : Number(e.target.value) })
          }
          aria-label={`Voltage of ${label}`}
          placeholder="V"
          title="What a power pin supplies or needs; the most a signal pin accepts. Empty: the part's logic voltage."
          className="hidden w-16 md:block"
        />
        <div className="w-0 min-w-0 flex-1">
          <PinDetails pin={pin} onChange={onChange} />
        </div>
        <NativeSelect
          value={pin.side}
          onChange={(e) => onMove(pin.key, e.target.value as PinSide)}
          aria-label={`Side of ${label}`}
          className="hidden w-24 sm:block"
        >
          {PIN_SIDES.map((s) => (
            <option key={s} value={s}>
              {PIN_SIDE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onRemove(pin.key)}
          aria-label={`Remove ${label}`}
        >
          <Trash2 />
        </Button>
      </div>
      {error && <p className="mt-0.5 ml-12 text-xs text-destructive">{error}</p>}
    </li>
  )
}

function SideSection({
  side,
  pins,
  errors,
  onChange,
  onMove,
  onRemove,
  onReorder,
  onAdd,
}: {
  side: PinSide
  pins: DraftPin[]
  errors: Map<string, string>
  onChange: Change
  onMove: (key: string, side: PinSide) => void
  onRemove: (key: string) => void
  onReorder: (side: PinSide, from: string, to: string) => void
  onAdd: (side: PinSide) => void
}) {
  // Touch: a short hold on the grip starts a drag, so scrolling the list still works.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(side, String(active.id), String(over.id))
  }
  const vertical = side === 'left' || side === 'right'
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">
        {PIN_SIDE_LABELS[side]} side
        {pins.length > 0 && (
          <>
            {' '}
            · {pins.length}, {vertical ? 'top to bottom' : 'left to right'}
          </>
        )}
      </h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pins.map((p) => p.key)} strategy={verticalListSortingStrategy}>
          <ol>
            {pins.map((pin) => (
              <PinRow
                key={pin.key}
                pin={pin}
                error={errors.get(pin.key)}
                onChange={onChange}
                onMove={onMove}
                onRemove={onRemove}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 text-muted-foreground"
        onClick={() => onAdd(side)}
      >
        <Plus />
        Add pin
      </Button>
    </section>
  )
}

/**
 * The part's pins, edited as a working copy and saved together, with a live preview of
 * the card. Saving sends the whole list; pins keep their ids, so wires survive renames.
 */
export function PinEditor({ part }: { part: PartDetail }) {
  const saved = useMemo(() => fromPins(part.pins), [part.pins])
  const [draft, setDraft] = useState(saved)
  const replacePins = useReplacePins()
  const errors = useMemo(() => pinErrors(draft), [draft])
  const dirty = useMemo(
    () => JSON.stringify(toPinsIn(draft)) !== JSON.stringify(toPinsIn(saved)),
    [draft, saved],
  )

  // Leaving the tab with unsaved pins asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change: Change = (key, change) =>
    setDraft((pins) => pins.map((p) => (p.key === key ? { ...p, ...change } : p)))
  // To the end of the new side.
  const move = (key: string, side: PinSide) =>
    setDraft((pins) => {
      const pin = pins.find((p) => p.key === key)!
      return withPositions([...pins.filter((p) => p.key !== key), { ...pin, side }])
    })
  const remove = (key: string) =>
    setDraft((pins) => withPositions(pins.filter((p) => p.key !== key)))
  const reorder = (side: PinSide, from: string, to: string) =>
    setDraft((pins) => {
      const onSide = pins.filter((p) => p.side === side)
      const moved = arrayMove(
        onSide,
        onSide.findIndex((p) => p.key === from),
        onSide.findIndex((p) => p.key === to),
      )
      return withPositions([...pins.filter((p) => p.side !== side), ...moved])
    })
  const add = (side: PinSide, names: string[] = ['']) =>
    setDraft((pins) => withPositions([...pins, ...names.map((name) => newPin(name, side))]))

  const save = () =>
    replacePins.mutate(
      { partId: part.id, data: { pins: toPinsIn(draft) } },
      { onSuccess: (result) => setDraft(fromPins(result.pins)) },
    )

  // Sides with pins, plus left and right, which every part is likely to need.
  const sides = PIN_SIDES.filter(
    (side) => side === 'left' || side === 'right' || draft.some((p) => p.side === side),
  )
  const missing = PIN_SIDES.filter((side) => !sides.includes(side))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <PastePinsDialog
            onAdd={(side, names) => add(side, names)}
            trigger={
              <Button variant="outline" size="sm">
                <ClipboardPaste />
                Paste pin names
              </Button>
            }
          />
          {missing.map((side) => (
            <Button key={side} variant="ghost" size="sm" onClick={() => add(side)}>
              <Plus />
              {PIN_SIDE_LABELS[side]} side
            </Button>
          ))}
        </div>
        {sides.map((side) => (
          <SideSection
            key={side}
            side={side}
            pins={draft.filter((p) => p.side === side)}
            errors={errors}
            onChange={change}
            onMove={move}
            onRemove={remove}
            onReorder={reorder}
            onAdd={add}
          />
        ))}
        <div className="sticky bottom-20 z-10 flex items-center gap-2 rounded-lg border bg-background/95 p-2 backdrop-blur md:bottom-4">
          <Button onClick={save} disabled={!dirty || errors.size > 0 || replacePins.isPending}>
            Save pins
          </Button>
          <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty}>
            Discard changes
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {errors.size > 0
              ? `Fix ${errors.size === 1 ? 'the pin' : `${errors.size} pins`} marked in red`
              : dirty
                ? 'Unsaved changes'
                : `${draft.length} pins, saved`}
          </span>
        </div>
      </div>
      <PartPreview name={part.name} pins={draft} />
    </div>
  )
}
