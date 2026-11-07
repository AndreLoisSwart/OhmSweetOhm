import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onSave: (value: string) => void
  'aria-label': string
  id?: string
  multiline?: boolean
  /** Single line reverts an emptied value instead of saving it, unless this is set. */
  allowEmpty?: boolean
  placeholder?: string
  className?: string
}

/** Text that reads as plain text and edits in place. Saves on blur or Enter. */
export function EditableText({
  value,
  onSave,
  multiline,
  allowEmpty = multiline,
  className,
  ...rest
}: Props) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)
  const cancelled = useRef(false)

  // Take on the new value when it changes elsewhere, e.g. after saving.
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(value)
      return
    }
    const next = multiline ? draft : draft.trim()
    if (!next && !allowEmpty) setDraft(value)
    else if (next !== value) onSave(next)
  }

  const props = {
    ...rest,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        cancelled.current = true
        e.currentTarget.blur()
      } else if (e.key === 'Enter' && !multiline) {
        e.currentTarget.blur()
      }
    },
    className: cn(
      'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors placeholder:text-muted-foreground hover:border-input focus:border-ring focus:ring-[3px] focus:ring-ring/50',
      className,
    ),
  }
  return multiline ? <textarea rows={4} {...props} /> : <input {...props} />
}
