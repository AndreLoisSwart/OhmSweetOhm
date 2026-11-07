import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useCreateDesign } from '@/api/generated/designs/designs'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NewDesignDialog({ trigger }: { trigger: ReactNode }) {
  const navigate = useNavigate()
  const createDesign = useCreateDesign()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createDesign.mutate(
      { data: { name } },
      {
        onSuccess: (design) => {
          setOpen(false)
          navigate(`/designs/${design.id}`)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName('')
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>New design</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-design-name">Name</Label>
            <Input
              id="new-design-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weather station"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createDesign.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
