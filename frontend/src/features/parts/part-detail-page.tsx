import { BadgeCheck, Copy, Cpu, ExternalLink, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessage } from '@/api/fetcher'
import type { LogicVoltage, PartKind, PartUpdate, Platform } from '@/api/generated/model'
import { useCopyPart, useDeletePart, useGetPart, useUpdatePart } from '@/api/generated/parts/parts'
import { CommitInput } from '@/components/commit-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditableText } from '@/components/editable-text'
import { EmptyState } from '@/components/empty-state'
import { useWidePage } from '@/components/layout/page-width'
import { LazyMarkdownEditor } from '@/components/lazy-markdown-editor'
import { DetailSkeleton } from '@/components/loading'
import { NativeSelect } from '@/components/native-select'
import { NotFound } from '@/components/not-found'
import { Button } from '@/components/ui/button'
import { AttachmentList } from '@/features/attachments/attachment-list'
import { TagEditor } from '@/features/tags/tag-editor'
import { formatDate } from '@/lib/format'
import { useAutosave } from '@/lib/use-autosave'
import { UnverifiedBadge } from './badges'
import {
  formatAddresses,
  formatVolts,
  parseAddresses,
  parseOptionalId,
  parseUrl,
  parseVolts,
} from './fields'
import {
  LOGIC_VOLTAGE_LABELS,
  LOGIC_VOLTAGES,
  PART_KIND_LABELS,
  PART_KINDS,
  PLATFORM_LABELS,
  PLATFORMS,
} from './labels'
import { LibrariesEditor } from './libraries-editor'
import { PinEditor } from './pins/pin-editor'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <>
      <dt className="pt-1.5 text-sm text-muted-foreground">
        <label htmlFor={htmlFor}>{label}</label>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

const asText = (s: string | null) => s ?? ''

export function PartDetailPage() {
  const partId = Number(useParams().id)
  const navigate = useNavigate()
  // The pin editor and its preview need the room.
  useWidePage()
  const { data: part, error, isPending } = useGetPart(partId)
  const updatePart = useUpdatePart()
  const copyPart = useCopyPart()
  const deletePart = useDeletePart()
  const save = (data: PartUpdate) => updatePart.mutate({ partId, data })
  const notes = useAutosave((notes_md) => save({ notes_md }))

  if (isPending) return <DetailSkeleton />
  if (error) {
    if (error.status === 404 || error.status === 422) return <NotFound />
    return (
      <EmptyState icon={Cpu} title="Couldn't load this part" description={errorMessage(error)} />
    )
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <EditableText
          value={part.name}
          onSave={(name) => save({ name })}
          aria-label="Name"
          className="-ml-2 text-2xl font-semibold tracking-tight"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy part"
            title="Copy: a new part with the same fields, pins and tags"
            onClick={() =>
              copyPart.mutate({ partId }, { onSuccess: (copy) => navigate(`/parts/${copy.id}`) })
            }
          >
            <Copy />
          </Button>
          <ConfirmDialog
            title={`Delete ${part.name}?`}
            description={
              part.used_in?.length
                ? "It's placed in a design, so it can't be deleted until it's removed there."
                : "Its pins and files go with it. This can't be undone."
            }
            onConfirm={() =>
              deletePart.mutate(
                { partId },
                { onSuccess: () => navigate('/parts', { replace: true }) },
              )
            }
            trigger={
              <Button variant="ghost" size="icon" aria-label="Delete part">
                <Trash2 />
              </Button>
            }
          />
        </div>
      </div>

      {!part.verified && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-status-amber/40 bg-status-amber/5 p-3 text-sm">
          <UnverifiedBadge />
          <span className="flex-1">
            {part.created_by === 'claude' ? 'Claude entered this part. ' : ''}
            Check the pins against the maker's pinout before relying on them.
          </span>
          <Button size="sm" variant="outline" onClick={() => save({ verified: true })}>
            <BadgeCheck />
            Mark verified
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <dl className="grid content-start gap-x-6 gap-y-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Kind" htmlFor="part-kind">
            <NativeSelect
              id="part-kind"
              value={part.kind}
              onChange={(e) => save({ kind: e.target.value as PartKind })}
              className="w-full sm:w-48"
            >
              {PART_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PART_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Logic voltage" htmlFor="part-logic">
            <NativeSelect
              id="part-logic"
              value={part.logic_voltage}
              onChange={(e) => save({ logic_voltage: e.target.value as LogicVoltage })}
              className="w-full sm:w-48"
            >
              {LOGIC_VOLTAGES.map((v) => (
                <option key={v} value={v}>
                  {LOGIC_VOLTAGE_LABELS[v]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Supply" htmlFor="part-supply-min">
            <div className="flex items-center gap-2 text-sm">
              <CommitInput
                id="part-supply-min"
                value={part.supply_min_v}
                format={formatVolts}
                parse={parseVolts}
                onSave={(supply_min_v) => save({ supply_min_v })}
                inputMode="decimal"
                aria-label="Lowest supply voltage"
                placeholder="min"
                className="w-20"
              />
              to
              <CommitInput
                value={part.supply_max_v}
                format={formatVolts}
                parse={parseVolts}
                onSave={(supply_max_v) => save({ supply_max_v })}
                inputMode="decimal"
                aria-label="Highest supply voltage"
                placeholder="max"
                className="w-20"
              />
              V
            </div>
          </Field>
          <Field label="I2C addresses" htmlFor="part-i2c">
            <CommitInput
              id="part-i2c"
              value={part.i2c_addresses}
              format={formatAddresses}
              parse={parseAddresses}
              onSave={(i2c_addresses) => save({ i2c_addresses })}
              placeholder="e.g. 0x76, 0x77 (default first)"
              className="w-full max-w-64 font-mono"
            />
          </Field>
          <Field label="Datasheet" htmlFor="part-datasheet">
            <div className="flex items-center gap-1">
              <CommitInput
                id="part-datasheet"
                type="url"
                value={part.datasheet_url}
                format={(s) => s}
                parse={parseUrl}
                onSave={(datasheet_url) => save({ datasheet_url })}
                placeholder="https://…"
              />
              {part.datasheet_url && (
                <Button variant="ghost" size="icon-sm" asChild>
                  <a
                    href={part.datasheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the datasheet"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          </Field>
          <Field label="Tags">
            <TagEditor value={part.tags} onChange={(tag_ids) => save({ tag_ids })} />
          </Field>
          <Field label="Shelf-help item" htmlFor="part-shelf">
            <CommitInput
              id="part-shelf"
              value={part.shelf_item_id}
              format={(id) => (id === null ? '' : String(id))}
              parse={parseOptionalId}
              onSave={(shelf_item_id) => save({ shelf_item_id })}
              inputMode="numeric"
              placeholder="Item id"
              title="The matching item in Shelf-help. Claude uses it to cross-reference stock."
              className="w-28"
            />
          </Field>
          <Field label="Wokwi type" htmlFor="part-wokwi">
            <CommitInput
              id="part-wokwi"
              value={part.wokwi_type}
              format={asText}
              parse={(text) => ({ value: text.trim() || null })}
              onSave={(wokwi_type) => save({ wokwi_type })}
              placeholder="e.g. board-esp32-devkit-c-v4"
              title="For simulating designs in Wokwi later (phase 2)"
              className="w-full max-w-64 font-mono"
            />
          </Field>
          {(part.kind === 'board' || part.platform || part.platformio_board) && (
            <>
              <Field label="Platform" htmlFor="part-platform">
                <NativeSelect
                  id="part-platform"
                  value={part.platform ?? ''}
                  onChange={(e) => save({ platform: (e.target.value || null) as Platform | null })}
                  className="w-full max-w-64"
                >
                  <option value="">Not set</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="PlatformIO board" htmlFor="part-pio-board">
                <CommitInput
                  id="part-pio-board"
                  value={part.platformio_board}
                  format={asText}
                  parse={(text) =>
                    /^[A-Za-z0-9_.-]*$/.test(text.trim())
                      ? { value: text.trim() || null }
                      : { error: 'Letters, digits, dots, dashes and _ only' }
                  }
                  onSave={(platformio_board) => save({ platformio_board })}
                  placeholder="e.g. esp32dev, uno"
                  title="The board id in platformio.ini, from PlatformIO's board list"
                  className="w-full max-w-64 font-mono"
                />
              </Field>
            </>
          )}
        </dl>

        <section>
          <h2 className="mb-2 text-sm font-medium">Description</h2>
          <EditableText
            multiline
            value={part.description}
            onSave={(description) => save({ description })}
            aria-label="Description"
            placeholder="What it is, which variant, where it came from…"
            className="-ml-2 resize-y text-sm"
          />
          <h2 className="mt-8 mb-1 text-sm font-medium">Libraries</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            What firmware for this part needs, as PlatformIO libraries. A design&apos;s
            platformio.ini lists them for its board.
          </p>
          <LibrariesEditor value={part.libraries} onChange={(libraries) => save({ libraries })} />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-1 text-lg font-semibold">Pins</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          In the order of the real headers, so the card reads like the board.
        </p>
        <PinEditor part={part} />
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium">Notes</h2>
          <LazyMarkdownEditor
            key={part.id}
            value={part.notes_md}
            onChange={notes.schedule}
            onBlur={notes.flush}
            aria-label="Notes"
            placeholder="Quirks, wiring tips, things learned the hard way…"
          />
        </section>
        <div className="grid content-start gap-8">
          <section>
            <h2 className="mb-2 text-sm font-medium">Used in</h2>
            {part.used_in?.length ? (
              <ul className="grid gap-1 text-sm">
                {part.used_in.map((design) => (
                  <li key={design.id}>
                    <Link
                      to={`/designs/${design.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {design.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Not placed in any design yet.</p>
            )}
          </section>
          <AttachmentList ownerType="part" ownerId={part.id} />
        </div>
      </div>

      <p className="mt-10 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        Added {formatDate(part.created_at)}
        {part.created_by === 'claude' && ' by Claude'} · Updated {formatDate(part.updated_at)}
        {part.verified && (
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs text-muted-foreground"
            onClick={() => save({ verified: false })}
          >
            · Mark unverified
          </Button>
        )}
      </p>
    </div>
  )
}
