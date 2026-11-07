import { keepPreviousData } from '@tanstack/react-query'
import { Cpu, PackagePlus, Plus, Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { PartKind } from '@/api/generated/model'
import { useListParts } from '@/api/generated/parts/parts'
import { useListTags } from '@/api/generated/tags/tags'
import { EmptyState } from '@/components/empty-state'
import { EntityPicker } from '@/components/entity-picker'
import { FilterBar } from '@/components/filter-bar'
import { LoadError } from '@/components/load-error'
import { ListSkeleton } from '@/components/loading'
import { NativeSelect } from '@/components/native-select'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { PART_KIND_LABELS, PART_KINDS } from './labels'
import { NewPartDialog } from './new-part-dialog'
import { PartRow } from './part-row'
import { StarterPartsDialog } from './starter-parts-dialog'

const starterButton = (
  <Button variant="outline" aria-label="Starter parts" title="Starter parts">
    <PackagePlus />
    <span className="hidden sm:inline">Starter parts</span>
  </Button>
)

const newPartButton = (
  <Button>
    <Plus />
    New part
  </Button>
)

export function PartsPage() {
  // Filters live in the URL, so they survive going back from a part.
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as PartKind | null) ?? undefined
  const tagId = params.has('tag') ? Number(params.get('tag')) : undefined
  const unverified = params.get('unverified') === '1'
  const filtered = Boolean(q || kind || tagId !== undefined || unverified)

  const setFilter = (key: string, value: string | number | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '') next.delete(key)
    else next.set(key, String(value))
    setParams(next, { replace: true })
  }

  const {
    data: parts,
    isPending,
    error,
    refetch,
  } = useListParts(
    {
      q: q || undefined,
      kind: kind ? [kind] : undefined,
      tag_id: tagId !== undefined ? [tagId] : undefined,
      verified: unverified ? false : undefined,
    },
    // Keep the list on screen while a new search loads, instead of flashing a skeleton.
    { query: { placeholderData: keepPreviousData } },
  )
  const { data: tags = [] } = useListTags()

  return (
    <>
      <PageHeader
        title="Parts"
        actions={
          <>
            <StarterPartsDialog trigger={starterButton} />
            <NewPartDialog trigger={newPartButton} />
          </>
        }
      />

      <FilterBar>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="Search parts"
            aria-label="Search parts"
            className="pl-8"
          />
        </div>
        <NativeSelect
          value={kind ?? ''}
          onChange={(e) => setFilter('kind', e.target.value || null)}
          aria-label="Kind"
          className="w-full sm:w-36"
        >
          <option value="">All kinds</option>
          {PART_KINDS.map((k) => (
            <option key={k} value={k}>
              {PART_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
        <EntityPicker
          options={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
          value={tagId ?? null}
          onChange={(id) => setFilter('tag', id)}
          placeholder="All tags"
          noneLabel="All tags"
          searchPlaceholder="Find a tag…"
          className="w-full sm:w-40"
        />
        <Toggle
          variant="outline"
          size="sm"
          pressed={unverified}
          onPressedChange={(on) => setFilter('unverified', on ? 1 : null)}
          className="data-[state=on]:text-status-amber"
        >
          Unverified
        </Toggle>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            <X />
            Clear
          </Button>
        )}
      </FilterBar>

      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <LoadError what="parts" error={error} onRetry={refetch} />
      ) : parts?.length ? (
        <div className="-mx-3 divide-y">
          {parts.map((part) => (
            <PartRow key={part.id} part={part} />
          ))}
        </div>
      ) : filtered ? (
        <EmptyState icon={Cpu} title="No parts match these filters" />
      ) : (
        <EmptyState
          icon={Cpu}
          title="No parts yet"
          description="The modules you build with, and their pins: boards, sensors, displays. Start with common ones, or add your own."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <StarterPartsDialog trigger={starterButton} />
            <NewPartDialog trigger={newPartButton} />
          </div>
        </EmptyState>
      )}
    </>
  )
}
