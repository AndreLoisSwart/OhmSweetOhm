import { Check, PackagePlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAddStarterParts, useListStarterParts } from '@/api/generated/parts/parts'
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
import { plural } from '@/lib/format'
import { PART_KIND_LABELS } from './labels'

/** Common modules to start the library with (docs/mvp.md), added unverified. */
export function StarterPartsDialog({ trigger }: { trigger: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { data: starters = [] } = useListStarterParts({ query: { enabled: open } })
  const addStarters = useAddStarterParts()
  const missing = starters.filter((p) => !p.present)

  const add = () =>
    addStarters.mutate(undefined, {
      onSuccess: ({ added }) => {
        setOpen(false)
        toast.success(
          `Added ${plural(added.length, 'part')}. Check each against your board, then mark it verified.`,
        )
        navigate('/parts?unverified=1')
      },
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Starter parts</DialogTitle>
          <DialogDescription>
            Common boards, sensors and modules, with their pins typed from the makers' pinouts by
            Claude. They come in unverified: check each against the board you have before relying on
            it. Parts already in your library (by name) are skipped.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-sm">
          {starters.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <span className="w-4 shrink-0">
                {p.present && <Check className="size-4 text-status-green" />}
              </span>
              <span className={p.present ? 'text-muted-foreground' : ''}>{p.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {PART_KIND_LABELS[p.kind]} · {plural(p.pin_count, 'pin')}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={add} disabled={!missing.length || addStarters.isPending}>
            <PackagePlus />
            {missing.length ? `Add ${plural(missing.length, 'part')}` : 'All added'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
