import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type PickerOption = {
  id: number
  label: string
  /** Shown in the trigger when selected. Defaults to the label. */
  display?: string
  /** Extra text that is searched and shown while searching, e.g. a location's parents. */
  hint?: string
  /** Indent level while not searching, for trees. */
  depth?: number
}

type Props = {
  options: PickerOption[]
  value: number | null | undefined
  onChange: (id: number | null) => void
  placeholder: string
  /** Adds a first option that picks null, e.g. "No location". */
  noneLabel?: string
  searchPlaceholder?: string
  /** Offers "Create …" for a search with no exact match. */
  onCreate?: (name: string) => void
  id?: string
  className?: string
}

/** Pick one record from a searchable list, optionally creating a new one. */
export function EntityPicker({
  options,
  value,
  onChange,
  placeholder,
  noneLabel,
  searchPlaceholder = 'Search…',
  onCreate,
  id,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((o) => o.id === value)
  const query = search.trim().toLowerCase()
  const matches = query
    ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(query))
    : options
  const exactMatch = options.some((o) => o.label.toLowerCase() === query)

  const close = () => {
    setOpen(false)
    setSearch('')
  }
  const pick = (next: number | null) => {
    onChange(next)
    close()
  }

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {selected
              ? (selected.display ?? selected.label)
              : (value === null && noneLabel) || placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        {/* Filtered here rather than by cmdk, to search hints and keep ids out of it. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {noneLabel && !query && (
                <CommandItem value="none" onSelect={() => pick(null)}>
                  <Check className={cn(value == null ? 'opacity-100' : 'opacity-0')} />
                  {noneLabel}
                </CommandItem>
              )}
              {matches.map((option) => (
                <CommandItem
                  key={option.id}
                  value={String(option.id)}
                  onSelect={() => pick(option.id)}
                >
                  <Check className={cn(option.id === value ? 'opacity-100' : 'opacity-0')} />
                  <span
                    className="truncate"
                    style={{ paddingLeft: query ? 0 : (option.depth ?? 0) * 12 }}
                  >
                    {option.label}
                  </span>
                  {query && option.hint && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
              {onCreate && query && !exactMatch && (
                <CommandItem
                  value="create"
                  onSelect={() => {
                    onCreate(search.trim())
                    close()
                  }}
                >
                  <Plus />
                  Create “{search.trim()}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
