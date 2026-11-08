import { cn } from 'cn'
import { Cable, ExternalLink, RotateCw, Trash2 } from 'lucide-react'
import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import type {
  CanvasPart,
  DesignDetail,
  NetOut,
  PlacementOut,
  WireColor,
  WireOut,
} from '@/api/generated/model'
import { CommitInput } from '@/components/commit-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditableText } from '@/components/editable-text'
import { Button } from '@/components/ui/button'
import { AttachmentList } from '@/features/attachments/attachment-list'
import { UnverifiedBadge } from '@/features/parts/badges'
import { pinColor, powerRole } from '@/features/parts/card/pin-style'
import { parseOptionalId } from '@/features/parts/fields'
import { TagEditor } from '@/features/tags/tag-editor'
import { HighlightContext, usePinnedNet } from './canvas/highlight'
import { describeNet, netsByPin, powerNote, turned } from './canvas/model'
import { SuggestWiringDialog } from './suggest-wiring-dialog'
import { type DesignActions, quietly } from './use-design-actions'

const WIRE_COLORS: WireColor[] = [
  'red',
  'black',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'gray',
  'white',
  'brown',
]

const REF_PATTERN = /^[a-z][a-z0-9_]{0,19}$/i

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** A `ref.PIN` that highlights its net when tapped. */
function PinButton({ pin, net }: { pin: string; net?: NetOut }) {
  const store = useContext(HighlightContext)
  return (
    <button
      type="button"
      className="rounded px-1 font-mono text-xs hover:bg-muted"
      onClick={() => store.toggle(net?.pins ?? [pin])}
    >
      {pin}
    </button>
  )
}

function PartInspector({
  placement,
  part,
  design,
  actions,
  readOnly,
}: {
  placement: PlacementOut
  part: CanvasPart
  design: DesignDetail
  actions: DesignActions
  readOnly: boolean
}) {
  const store = useContext(HighlightContext)
  const nets = netsByPin(design)
  const [suggesting, setSuggesting] = useState(false)
  const save = (data: Parameters<DesignActions['updatePlacement']>[1]) =>
    quietly(actions.updatePlacement(placement.id, data))
  // The pin assignment helper: for parts with unwired pins, in a design with a board.
  const hasBoard = design.parts.some(
    (p) =>
      p.kind === 'board' &&
      design.placements.some((pl) => pl.part_id === p.id && pl.id !== placement.id),
  )
  const unwired = part.pins.some(
    (pin) => pin.kind !== 'nc' && !nets.has(`${placement.ref}.${pin.name}`),
  )
  const canSuggest = !readOnly && part.kind !== 'board' && hasBoard && unwired
  return (
    <div className="grid gap-4">
      <div>
        {readOnly ? (
          <div className="font-mono text-lg font-semibold">{placement.ref}</div>
        ) : (
          <EditableText
            value={placement.ref}
            onSave={(ref) => {
              if (!REF_PATTERN.test(ref)) {
                toast.error('A ref starts with a letter, then letters, digits or _ (up to 20)')
                return
              }
              save({ ref })
            }}
            aria-label="Ref"
            className="-ml-2 font-mono text-lg font-semibold"
          />
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link to={`/parts/${part.id}`} className="underline-offset-4 hover:underline">
            {part.name}
          </Link>
          {!part.verified && <UnverifiedBadge />}
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => save(turned(placement, part))}>
            <RotateCw />
            Rotate ({placement.rotation}°)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => quietly(actions.removePlacement(placement.id))}
          >
            <Trash2 />
            Remove
          </Button>
        </div>
      )}
      {canSuggest && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setSuggesting(true)}
          >
            <Cable />
            Suggest wiring
          </Button>
          <SuggestWiringDialog
            design={design}
            placementRef={placement.ref}
            actions={actions}
            open={suggesting}
            onOpenChange={setSuggesting}
          />
        </>
      )}
      <Section title="Note">
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap">{placement.note || '—'}</p>
        ) : (
          <EditableText
            multiline
            value={placement.note}
            onSave={(note) => save({ note })}
            aria-label="Note"
            placeholder="e.g. mounted on the lid"
            className="-ml-2 text-sm"
          />
        )}
      </Section>
      <Section title="Pins">
        <ul className="grid gap-0.5 text-xs">
          {part.pins.map((pin) => {
            const key = `${placement.ref}.${pin.name}`
            const net = nets.get(key)
            const note = powerNote(design, key)
            const role = powerRole(pin.kind)
            return (
              <li key={pin.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
                  onClick={() => store.toggle(net?.pins ?? [key])}
                >
                  <span
                    className="size-2 shrink-0 rounded-full border-[1.5px]"
                    style={
                      role === 'load'
                        ? { borderColor: pinColor(pin.kind) }
                        : { background: pinColor(pin.kind), borderColor: pinColor(pin.kind) }
                    }
                  />
                  <span className="w-20 shrink-0 truncate font-mono">{pin.name}</span>
                  <span
                    className={cn('truncate', net ? 'text-foreground' : 'text-muted-foreground/60')}
                  >
                    {net ? net.name : '—'}
                  </span>
                  {note && (
                    <span className="min-w-0 truncate text-muted-foreground" title={note}>
                      {note}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}

function WireInspector({
  wire,
  design,
  actions,
  readOnly,
}: {
  wire: WireOut
  design: DesignDetail
  actions: DesignActions
  readOnly: boolean
}) {
  const nets = netsByPin(design)
  const save = (data: Parameters<DesignActions['updateWire']>[1]) =>
    quietly(actions.updateWire(wire.id, data))
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <PinButton pin={wire.a} net={nets.get(wire.a)} />
        <span className="text-muted-foreground">↔</span>
        <PinButton pin={wire.b} net={nets.get(wire.b)} />
      </div>
      <Section title="Colour">
        <div className="flex flex-wrap gap-1.5">
          {WIRE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={`Colour ${color}`}
              aria-pressed={wire.color === color}
              disabled={readOnly}
              onClick={() => save({ color })}
              className={cn(
                'size-7 rounded-full border-2 border-[var(--wire-outline)] disabled:cursor-default',
                wire.color === color && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
              )}
              style={{ background: `var(--wire-${color})` }}
            />
          ))}
        </div>
      </Section>
      <Section title="Label">
        {readOnly ? (
          <p className="text-sm">{wire.label || '—'}</p>
        ) : (
          <EditableText
            value={wire.label}
            allowEmpty
            onSave={(label) => save({ label })}
            aria-label="Label"
            placeholder="e.g. 5 V from USB"
            className="-ml-2 text-sm"
          />
        )}
      </Section>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => quietly(actions.removeWire(wire.id))}
        >
          <Trash2 />
          Remove wire
        </Button>
      )}
    </div>
  )
}

function DesignInspector({
  design,
  actions,
  readOnly,
  onDelete,
}: {
  design: DesignDetail
  actions: DesignActions
  readOnly: boolean
  onDelete: () => void
}) {
  const save = (data: Parameters<DesignActions['updateDesign']>[0]) =>
    quietly(actions.updateDesign(data))
  return (
    <div className="grid gap-5">
      <Section title="Description">
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap">{design.description_md || '—'}</p>
        ) : (
          <EditableText
            multiline
            value={design.description_md}
            onSave={(description_md) => save({ description_md })}
            aria-label="Description"
            placeholder="What it does, where it goes…"
            className="-ml-2 text-sm"
          />
        )}
      </Section>
      {!readOnly && (
        <>
          <Section title="Tags">
            <TagEditor value={design.tags} onChange={(tag_ids) => save({ tag_ids })} />
          </Section>
          <Section title="Shelf-help project">
            <CommitInput
              value={design.shelf_project_id}
              format={(id) => (id === null ? '' : String(id))}
              parse={parseOptionalId}
              onSave={(shelf_project_id) => save({ shelf_project_id })}
              inputMode="numeric"
              placeholder="Project id"
              aria-label="Shelf-help project id"
              className="w-28"
            />
          </Section>
          <Section title="Firmware">
            <div className="flex items-center gap-1">
              <CommitInput
                value={design.firmware_repo}
                format={(repo) => repo ?? ''}
                parse={(text) => ({ value: text.trim() || null })}
                onSave={(firmware_repo) => save({ firmware_repo })}
                placeholder="Repo path or URL"
                aria-label="Firmware repo"
                title="Where this design's firmware lives. Claude checks its pins.h against the design before changing pin code."
                className="font-mono text-xs"
              />
              {design.firmware_repo && /^https?:\/\//i.test(design.firmware_repo) && (
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={design.firmware_repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the firmware repo"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          </Section>
        </>
      )}
      {readOnly && design.firmware_repo && (
        <Section title="Firmware">
          <p className="font-mono text-xs break-all">{design.firmware_repo}</p>
        </Section>
      )}
      <Section title={`Nets (${design.nets.length})`}>
        {design.nets.length ? (
          <ul className="grid gap-1 text-xs">
            {design.nets.map((net) => (
              <li key={net.name}>
                <span className="font-medium">{net.name}</span>
                <span className="text-muted-foreground">: </span>
                {net.pins.map((pin, i) => (
                  <span key={pin}>
                    {i > 0 && ', '}
                    <PinButton pin={pin} net={net} />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No wires yet.</p>
        )}
      </Section>
      {!readOnly && (
        <>
          <AttachmentList ownerType="design" ownerId={design.id} />
          <ConfirmDialog
            title={`Delete ${design.name}?`}
            description="Its placements, wires and files go with it. The parts stay in the library."
            onConfirm={onDelete}
            trigger={
              <Button variant="ghost" size="sm" className="w-fit text-destructive">
                <Trash2 />
                Delete design
              </Button>
            }
          />
        </>
      )}
    </div>
  )
}

/** The net pinned by tapping a pin. Not the hovered one: the panel mustn't shift under
 * the pointer on its way to a button. */
function NetNotice({ design }: { design: DesignDetail }) {
  const pins = usePinnedNet()
  if (!pins.length) return null
  const net = netsByPin(design).get(pins[0])
  const described = net && describeNet(design, net)
  return (
    <div className="rounded-md bg-primary/10 p-2 text-xs">
      <div className="font-medium">{described ? described.title : `${pins[0]} (not wired)`}</div>
      {described && <div className="mt-0.5 text-muted-foreground">{described.detail}</div>}
    </div>
  )
}

export function Inspector({
  design,
  placement,
  wire,
  actions,
  readOnly,
  onDeleteDesign,
}: {
  design: DesignDetail
  placement?: PlacementOut
  wire?: WireOut
  actions: DesignActions
  readOnly: boolean
  onDeleteDesign: () => void
}) {
  const part = placement && design.parts.find((p) => p.id === placement.part_id)
  return (
    <div className="grid gap-4">
      <NetNotice design={design} />
      {placement && part ? (
        <PartInspector
          key={placement.id}
          placement={placement}
          part={part}
          design={design}
          actions={actions}
          readOnly={readOnly}
        />
      ) : wire ? (
        <WireInspector
          key={wire.id}
          wire={wire}
          design={design}
          actions={actions}
          readOnly={readOnly}
        />
      ) : (
        <DesignInspector
          design={design}
          actions={actions}
          readOnly={readOnly}
          onDelete={onDeleteDesign}
        />
      )}
    </div>
  )
}
