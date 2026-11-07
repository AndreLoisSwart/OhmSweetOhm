import { Trash2 } from 'lucide-react'
import type { TagOut } from '@/api/generated/model'
import { useCreateTag, useDeleteTag, useListTags, useUpdateTag } from '@/api/generated/tags/tags'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EditableText } from '@/components/editable-text'
import { InlineAddForm } from '@/components/inline-add-form'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/format'

const usage = (tag: TagOut) =>
  `${plural(tag.part_count, 'part')} and ${plural(tag.design_count, 'design')}`

export function TagManager() {
  const { data: tags = [], isPending } = useListTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  return (
    <section>
      <h2 className="text-lg font-semibold">Tags</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Shared by parts and designs. Click a name to rename it.
      </p>
      {tags.length > 0 ? (
        <ul className="mb-4">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/60"
            >
              <EditableText
                value={tag.name}
                onSave={(name) => updateTag.mutate({ tagId: tag.id, data: { name } })}
                aria-label={`Name of tag ${tag.name}`}
              />
              <span className="shrink-0 text-xs text-muted-foreground">{usage(tag)}</span>
              <ConfirmDialog
                title={`Delete the tag ${tag.name}?`}
                description={
                  tag.part_count + tag.design_count > 0
                    ? `It will be removed from ${usage(tag)}.`
                    : undefined
                }
                onConfirm={() => deleteTag.mutate({ tagId: tag.id })}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete tag ${tag.name}`}>
                    <Trash2 />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        !isPending && <p className="mb-4 text-sm text-muted-foreground">No tags yet.</p>
      )}
      <InlineAddForm
        placeholder="New tag"
        onAdd={(name) => createTag.mutateAsync({ data: { name } })}
      />
    </section>
  )
}
