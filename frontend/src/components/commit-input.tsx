import { type ComponentProps, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'

type Props<T> = Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: T
  /** How the value shows in the field. */
  format: (value: T) => string
  /** The value typed, or an error message to show. */
  parse: (text: string) => { value: T } | { error: string }
  onSave: (value: T) => void
}

/** An input that saves on blur or Enter, reverts on Escape, and refuses bad input. */
export function CommitInput<T>({ value, format, parse, onSave, ...props }: Props<T>) {
  const [text, setText] = useState(format(value))
  const [shown, setShown] = useState(value)

  // Take on the new value when it changes elsewhere, e.g. after saving.
  if (value !== shown) {
    setShown(value)
    setText(format(value))
  }

  const commit = () => {
    if (text === format(value)) return
    const result = parse(text)
    if ('error' in result) {
      toast.error(result.error)
      setText(format(value))
    } else onSave(result.value)
  }

  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(format(value))
          e.currentTarget.blur()
        }
      }}
    />
  )
}
