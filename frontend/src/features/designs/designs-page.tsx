import { Link2, Plus, Workflow, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useListDesigns } from '@/api/generated/designs/designs'
import type { DesignSummary } from '@/api/generated/model'
import { useListTags } from '@/api/generated/tags/tags'
import { EmptyState } from '@/components/empty-state'
import { EntityPicker } from '@/components/entity-picker'
import { FilterBar } from '@/components/filter-bar'
import { LoadError } from '@/components/load-error'
import { ListSkeleton } from '@/components/loading'
import { PageHeader } from '@/components/page-header'
import { TagChips } from '@/components/tag-chips'
import { Button } from '@/components/ui/button'
import { plural, timeAgo } from '@/lib/format'
import { CheckCounts } from './checks-bar'
import { NewDesignDialog } from './new-design-dialog'

const newDesignButton = (
  <Button>
    <Plus />
    New design
  </Button>
)

function DesignRow({ design }: { design: DesignSummary }) {
  return (
    <Link
      to={`/designs/${design.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{design.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{plural(design.part_count, 'part')}</span>
          <span>·</span>
          <span>changed {timeAgo(design.updated_at)}</span>
          {design.shelf_project_id !== null && (
            <span
              className="flex items-center gap-0.5"
              title={`Linked to Shelf-help project ${design.shelf_project_id}`}
            >
              <Link2 className="size-3" />
              Shelf-help
            </span>
          )}
          <TagChips tags={design.tags} />
        </div>
      </div>
      <CheckCounts summary={design.check_summary} className="shrink-0 text-xs" />
    </Link>
  )
}

export function DesignsPage() {
  const [params, setParams] = useSearchParams()
  const tagId = params.has('tag') ? Number(params.get('tag')) : undefined
  const {
    data: designs,
    isPending,
    error,
    refetch,
  } = useListDesigns({
    tag_id: tagId !== undefined ? [tagId] : undefined,
  })
  const { data: tags = [] } = useListTags()

  return (
    <>
      <PageHeader title="Designs" actions={<NewDesignDialog trigger={newDesignButton} />} />
      {tags.some((t) => t.design_count > 0) && (
        <FilterBar>
          <EntityPicker
            options={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
            value={tagId ?? null}
            onChange={(id) => setParams(id === null ? {} : { tag: String(id) }, { replace: true })}
            placeholder="All tags"
            noneLabel="All tags"
            searchPlaceholder="Find a tag…"
            className="w-full sm:w-40"
          />
          {tagId !== undefined && (
            <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
              <X />
              Clear
            </Button>
          )}
        </FilterBar>
      )}
      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <LoadError what="designs" error={error} onRetry={refetch} />
      ) : designs?.length ? (
        <div className="-mx-3 divide-y">
          {designs.map((design) => (
            <DesignRow key={design.id} design={design} />
          ))}
        </div>
      ) : tagId !== undefined ? (
        <EmptyState icon={Workflow} title="No designs with this tag" />
      ) : (
        <EmptyState
          icon={Workflow}
          title="No designs yet"
          description="Wiring diagrams built from your parts: place them, then wire pin to pin."
        >
          <NewDesignDialog trigger={newDesignButton} />
        </EmptyState>
      )}
    </>
  )
}
