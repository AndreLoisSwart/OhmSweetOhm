import { X } from 'lucide-react'
import { EntityPicker } from '@/components/entity-picker'
import { Badge } from '@/components/ui/badge'

type Option = { id: number; name: string }

type Props = {
  /** What one chip is, e.g. "tag" or "shop", for labels. */
  noun: string
  value: Option[]
  options: Option[]
  onChange: (ids: number[]) => void
  onCreate: (name: string, add: (id: number) => void) => void
}

/** Assigned records as removable chips, plus a picker that can create new ones. */
export function ChipPicker({ noun, value, options, onChange, onCreate }: Props) {
  const ids = value.map((option) => option.id)
  const add = (id: number) => onChange([...ids, id])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((option) => (
        <Badge key={option.id} variant="secondary" className="h-7 gap-1 pr-1 font-normal">
          {option.name}
          <button
            type="button"
            onClick={() => onChange(ids.filter((id) => id !== option.id))}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${noun} ${option.name}`}
          >
            <X />
          </button>
        </Badge>
      ))}
      <EntityPicker
        options={options
          .filter((o) => !ids.includes(o.id))
          .map((o) => ({ id: o.id, label: o.name }))}
        value={undefined}
        onChange={(id) => id != null && add(id)}
        placeholder={`Add ${noun}`}
        searchPlaceholder={`Find or create a ${noun}…`}
        onCreate={(name) => onCreate(name, add)}
        className="h-7 w-auto"
      />
    </div>
  )
}
