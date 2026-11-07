import type { TagRef } from '@/api/generated/model'
import { useCreateTag, useListTags } from '@/api/generated/tags/tags'
import { ChipPicker } from '@/components/chip-picker'

type Props = { value: TagRef[]; onChange: (tagIds: number[]) => void }

/** Assigned tags with remove buttons, plus a picker that can create new tags. */
export function TagEditor({ value, onChange }: Props) {
  const { data: tags = [] } = useListTags()
  const createTag = useCreateTag()
  return (
    <ChipPicker
      noun="tag"
      value={value}
      options={tags}
      onChange={onChange}
      onCreate={(name, add) =>
        createTag.mutate({ data: { name } }, { onSuccess: (tag) => add(tag.id) })
      }
    />
  )
}
