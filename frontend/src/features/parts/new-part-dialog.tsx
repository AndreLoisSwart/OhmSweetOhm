import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { LogicVoltage, PartKind } from '@/api/generated/model'
import { useCreatePart } from '@/api/generated/parts/parts'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LOGIC_VOLTAGE_LABELS, LOGIC_VOLTAGES, PART_KIND_LABELS, PART_KINDS } from './labels'

/** Name, kind and logic voltage; the rest (pins above all) is filled in on the part page. */
export function NewPartDialog({ trigger }: { trigger: ReactNode }) {
  const navigate = useNavigate()
  const createPart = useCreatePart()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PartKind>('sensor')
  const [logic, setLogic] = useState<LogicVoltage>('3v3')

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setName('')
      setKind('sensor')
      setLogic('3v3')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createPart.mutate(
      { data: { name, kind, logic_voltage: logic } },
      {
        onSuccess: (part) => {
          setOpen(false)
          navigate(`/parts/${part.id}`)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New part</DialogTitle>
            <DialogDescription>
              To start from a similar part, open it and use Copy instead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-part-name">Name</Label>
            <Input
              id="new-part-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BME280 breakout"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-part-kind">Kind</Label>
              <NativeSelect
                id="new-part-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as PartKind)}
              >
                {PART_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PART_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-part-logic">Logic voltage</Label>
              <NativeSelect
                id="new-part-logic"
                value={logic}
                onChange={(e) => setLogic(e.target.value as LogicVoltage)}
              >
                {LOGIC_VOLTAGES.map((v) => (
                  <option key={v} value={v}>
                    {LOGIC_VOLTAGE_LABELS[v]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createPart.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
