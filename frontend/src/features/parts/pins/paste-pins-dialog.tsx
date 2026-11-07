import { useState, type FormEvent, type ReactNode } from 'react'
import type { PinSide } from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PIN_SIDE_LABELS, PIN_SIDES } from '@/features/parts/labels'
import { parseNames } from './draft'

/** Adds a header's worth of pins at once, from names typed or pasted from a pinout. */
export function PastePinsDialog({
  trigger,
  onAdd,
}: {
  trigger: ReactNode
  onAdd: (side: PinSide, names: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [side, setSide] = useState<PinSide>('left')
  const names = parseNames(text)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!names.length) return
    onAdd(side, names)
    setOpen(false)
    setText('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Paste pin names</DialogTitle>
            <DialogDescription>
              One header at a time, in order: top to bottom for left and right, left to right for
              top and bottom. Kinds are guessed from the names; check them afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="paste-pins">Names, one per line or separated by commas</Label>
            <Textarea
              id="paste-pins"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="font-mono"
              placeholder={'VIN\nGND\nSCL\nSDA'}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="paste-side">Side</Label>
            <NativeSelect
              id="paste-side"
              value={side}
              onChange={(e) => setSide(e.target.value as PinSide)}
              className="w-40"
            >
              {PIN_SIDES.map((s) => (
                <option key={s} value={s}>
                  {PIN_SIDE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!names.length}>
              Add {names.length || ''} {names.length === 1 ? 'pin' : 'pins'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
