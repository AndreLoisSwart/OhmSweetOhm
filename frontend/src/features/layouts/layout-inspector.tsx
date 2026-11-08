import { Cable, CircuitBoard, ExternalLink, RotateCw, Scissors, Trash2, Undo } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type {
  ConnectorType,
  DesignDetail,
  LayoutDetail,
  Mount,
  WireColor,
} from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditableText } from '@/components/editable-text'
import { Button } from '@/components/ui/button'
import { quietly } from '@/features/designs/use-design-actions'
import { nextRotation } from './board/geometry'
import { CONNECTOR_TYPES, type Selection } from './board/tools'
import type { LayoutActions } from './use-layout-actions'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

const MOUNTS: { mount: Mount; label: string; hint: string }[] = [
  {
    mount: 'socketed',
    label: 'Socketed',
    hint: 'In female headers, raised: holes under it stay usable',
  },
  {
    mount: 'soldered',
    label: 'Soldered',
    hint: 'Straight onto the board: holes under it are blocked',
  },
]

function PartDetails({
  layout,
  design,
  placementId,
  actions,
  readOnly,
}: {
  layout: LayoutDetail
  design: DesignDetail
  placementId: number
  actions: LayoutActions
  readOnly: boolean
}) {
  const part = layout.parts.find((p) => p.placement_id === placementId)
  if (!part) return null
  const nets = new Map<string, string>()
  for (const net of design.nets) for (const pin of net.pins) nets.set(pin, net.name)
  const move = (change: Partial<{ rotation: 0 | 90 | 180 | 270; mount: Mount }>) =>
    quietly(
      actions.place([
        {
          placement_id: part.placement_id,
          strip: part.strip,
          hole: part.hole,
          ...change,
        },
      ]),
    )
  return (
    <div className="grid gap-4">
      <div>
        <div className="font-mono text-lg font-semibold">{part.ref}</div>
        <Link to={`/parts/${part.part_id}`} className="text-sm underline-offset-4 hover:underline">
          {part.part_name}
        </Link>
        <div className="mt-1 text-sm text-muted-foreground">
          {part.on_board ? (
            <>
              First pin at <span className="font-mono text-foreground">{part.at}</span>, turned{' '}
              {part.rotation}°
            </>
          ) : (
            'Off the board, on a cable'
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {part.on_board ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => move({ rotation: nextRotation(part.rotation) })}
              >
                <RotateCw />
                Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  quietly(actions.place([{ placement_id: part.placement_id, on_board: false }]))
                }
              >
                <Cable />
                Off board
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => quietly(actions.unplace(part.placement_id))}
            title="Back to not placed"
          >
            <Undo />
            Unplace
          </Button>
          {part.on_board && layout.board_type === 'stripboard' && (
            <Button
              variant="ghost"
              size="sm"
              title="Cut every strip it spans between pins that mustn't be joined, such as a module's two header rows"
              onClick={() => quietly(actions.cutBetweenRows(part.placement_id))}
            >
              <Scissors />
              Cut between rows
            </Button>
          )}
        </div>
      )}
      {part.on_board && (
        <Section title="Mount">
          <div className="flex gap-1" role="group" aria-label="Mount">
            {MOUNTS.map((m) => (
              <Button
                key={m.mount}
                size="sm"
                variant={part.mount === m.mount ? 'secondary' : 'ghost'}
                aria-pressed={part.mount === m.mount}
                title={m.hint}
                disabled={readOnly}
                onClick={() => part.mount !== m.mount && move({ mount: m.mount })}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </Section>
      )}
      {part.on_board && (
        <Section title="Pins">
          <ul className="grid gap-0.5 text-xs">
            {part.pins.map((pin) => (
              <li key={pin.key} className="flex gap-2 px-1">
                <span className="w-20 truncate font-mono">{pin.key.split('.')[1]}</span>
                <span className="w-10 font-mono text-muted-foreground">{pin.at}</span>
                <span className="truncate text-muted-foreground">{nets.get(pin.key) ?? '—'}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Button asChild variant="link" size="sm" className="justify-self-start px-0">
        <Link to={`/designs/${design.id}?select=${part.placement_id}`}>
          <ExternalLink />
          Show in schematic
        </Link>
      </Button>
    </div>
  )
}

function LayoutDetails({
  layout,
  actions,
  readOnly,
  onDelete,
}: {
  layout: LayoutDetail
  actions: LayoutActions
  readOnly: boolean
  onDelete: () => void
}) {
  const s = layout.stats
  const rows: [string, ReactNode][] = [
    [
      'Board',
      `${layout.board_type === 'stripboard' ? 'Stripboard' : 'Breadboard pattern'}, ${layout.strips} × ${layout.holes}`,
    ],
    ['Parts', `${s.on_board} on, ${s.off_board} off, ${s.not_placed} not placed`],
    ['Still to join', s.missing],
    ['Cuts', s.cuts],
    ['Jumpers', `${s.jumpers}${s.jumpers ? `, ${s.jumper_length} holes long in all` : ''}`],
    ['Area used', s.area_strips ? `${s.area_strips} strips × ${s.area_holes} holes` : '—'],
  ]
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <CircuitBoard className="size-4 text-muted-foreground" />
        {readOnly ? (
          <h2 className="font-semibold">{layout.name}</h2>
        ) : (
          <EditableText
            value={layout.name}
            onSave={(name) => quietly(actions.update({ name }))}
            aria-label="Layout name"
            className="-ml-2 font-semibold"
          />
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <Section title="Notes">
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap">{layout.notes || '—'}</p>
        ) : (
          <EditableText
            multiline
            allowEmpty
            value={layout.notes}
            onSave={(notes) => quietly(actions.update({ notes }))}
            aria-label="Notes"
            placeholder="e.g. headers on the left edge for the lid"
            className="-ml-2 text-sm"
          />
        )}
      </Section>
      {!readOnly && layout.board_type === 'stripboard' && s.on_board > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          title="Cut each strip just past its outermost connection, between holes"
          onClick={() => quietly(actions.trim())}
        >
          <Scissors />
          Trim dead copper
        </Button>
      )}
      {!readOnly && (
        <ConfirmDialog
          title={`Delete ${layout.name}?`}
          description="The design itself stays as it is; only this board layout goes."
          onConfirm={onDelete}
          trigger={
            <Button variant="ghost" size="sm" className="justify-self-start text-destructive">
              <Trash2 />
              Delete layout
            </Button>
          }
        />
      )}
    </div>
  )
}

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

function JumperDetails({
  layout,
  jumperId,
  actions,
  readOnly,
}: {
  layout: LayoutDetail
  jumperId: number
  actions: LayoutActions
  readOnly: boolean
}) {
  const j = layout.jumpers.find((x) => x.id === jumperId)
  if (!j) return null
  const save = (data: Parameters<LayoutActions['updateJumper']>[1]) =>
    quietly(actions.updateJumper(j.id, data))
  return (
    <div className="grid gap-4">
      <div>
        <div className="text-lg font-semibold">
          {j.side === 'top' ? 'Jumper' : 'Bottom link'}{' '}
          <span className="font-mono">
            {j.a} → {j.b}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">{j.length} holes long</div>
      </div>
      <Section title="Side">
        <div className="flex gap-1" role="group" aria-label="Side">
          {(['top', 'bottom'] as const).map((side) => (
            <Button
              key={side}
              size="sm"
              variant={j.side === side ? 'secondary' : 'ghost'}
              aria-pressed={j.side === side}
              disabled={readOnly}
              onClick={() => j.side !== side && save({ side })}
            >
              {side === 'top' ? 'Component side' : 'Copper side'}
            </Button>
          ))}
        </div>
        {j.side === 'bottom' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={j.insulated}
              disabled={readOnly}
              onChange={(e) => save({ insulated: e.target.checked })}
            />
            Insulated (touches only its ends; bare, it joins every strip it crosses)
          </label>
        )}
      </Section>
      <Section title="Colour">
        <div className="flex flex-wrap gap-1.5">
          {WIRE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={j.color === color}
              disabled={readOnly}
              onClick={() => save({ color })}
              className="size-6 rounded-full border-2 border-background ring-1 ring-border aria-pressed:ring-2 aria-pressed:ring-primary"
              style={{ background: color }}
            />
          ))}
        </div>
      </Section>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start text-destructive"
          onClick={() => quietly(actions.removeJumper(j.id))}
        >
          <Trash2 />
          Remove
        </Button>
      )}
    </div>
  )
}

function ConnectorDetails({
  layout,
  design,
  connectorId,
  actions,
  readOnly,
}: {
  layout: LayoutDetail
  design: DesignDetail
  connectorId: number
  actions: LayoutActions
  readOnly: boolean
}) {
  const c = layout.connectors.find((x) => x.id === connectorId)
  if (!c) return null
  // What a pin can carry: pins of the parts off the board, plus whatever it has now.
  const offBoard = new Set(layout.parts.filter((p) => !p.on_board).map((p) => p.placement_id))
  const parts = new Map(design.parts.map((p) => [p.id, p]))
  const choices = design.placements
    .filter((p) => offBoard.has(p.id))
    .flatMap((p) => (parts.get(p.part_id)?.pins ?? []).map((pin) => `${p.ref}.${pin.name}`))
  const current = c.pins.map((p) => p.pin)
  const assign = (index: number, value: string | null) =>
    quietly(
      actions.updateConnector(c.id, {
        pins: current.map((pin, i) => (i === index ? value : pin)),
      }),
    )
  return (
    <div className="grid gap-4">
      <div>
        <div className="font-mono text-lg font-semibold">{c.ref}</div>
        <div className="text-sm text-muted-foreground">
          {CONNECTOR_TYPES.find((t) => t.type === c.type)?.label}, {c.pin_count} pins
          {c.at ? `, pin 1 at ${c.at}` : ', not on the board'}
        </div>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              quietly(actions.updateConnector(c.id, { rotation: nextRotation(c.rotation) }))
            }
          >
            <RotateCw />
            Rotate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => quietly(actions.removeConnector(c.id))}
          >
            <Trash2 />
            Remove
          </Button>
        </div>
      )}
      <Section title="Type">
        <NativeSelect
          value={c.type}
          disabled={readOnly}
          aria-label="Connector type"
          onChange={(e) =>
            quietly(actions.updateConnector(c.id, { type: e.target.value as ConnectorType }))
          }
        >
          {CONNECTOR_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </Section>
      <Section title="Pins">
        <ul className="grid gap-1">
          {c.pins.map((pin, i) => (
            <li key={pin.index} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right font-mono text-xs text-muted-foreground">
                {pin.index}
              </span>
              <NativeSelect
                value={pin.pin ?? ''}
                disabled={readOnly}
                aria-label={`What pin ${pin.index} carries`}
                className="h-7 min-w-0 flex-1 font-mono text-xs"
                onChange={(e) => assign(i, e.target.value || null)}
              >
                <option value="">Nothing</option>
                {[...new Set([...(pin.pin ? [pin.pin] : []), ...choices])].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => quietly(actions.updateConnector(c.id, { pin_count: c.pin_count + 1 }))}
            >
              Add a pin
            </Button>
            {c.pin_count > 1 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  quietly(actions.updateConnector(c.id, { pin_count: c.pin_count - 1 }))
                }
              >
                Remove the last pin
              </Button>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

/** The selected part, jumper or connector; or the layout itself when nothing is. */
export function LayoutInspector({
  layout,
  design,
  selected,
  actions,
  readOnly,
  onDelete,
}: {
  layout: LayoutDetail
  design: DesignDetail
  selected: Selection
  actions: LayoutActions
  readOnly: boolean
  onDelete: () => void
}) {
  if (selected?.kind === 'jumper' && layout.jumpers.some((j) => j.id === selected.id))
    return (
      <JumperDetails layout={layout} jumperId={selected.id} actions={actions} readOnly={readOnly} />
    )
  if (selected?.kind === 'connector' && layout.connectors.some((c) => c.id === selected.id))
    return (
      <ConnectorDetails
        layout={layout}
        design={design}
        connectorId={selected.id}
        actions={actions}
        readOnly={readOnly}
      />
    )
  return selected?.kind === 'part' && layout.parts.some((p) => p.placement_id === selected.id) ? (
    <PartDetails
      layout={layout}
      design={design}
      placementId={selected.id}
      actions={actions}
      readOnly={readOnly}
    />
  ) : (
    <LayoutDetails layout={layout} actions={actions} readOnly={readOnly} onDelete={onDelete} />
  )
}
