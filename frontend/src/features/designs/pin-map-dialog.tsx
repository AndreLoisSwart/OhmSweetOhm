import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { useGetPinMap } from '@/api/generated/firmware/firmware'
import type { DesignDetail, Lang } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BoardPicker, FileActions, FileText } from './firmware-files'
import { useBoard } from './use-board'

const LANGS: { lang: Lang; label: string }[] = [
  { lang: 'c', label: 'Arduino (pins.h)' },
  { lang: 'py', label: 'MicroPython (pins.py)' },
]

/** The design's pins as firmware constants (docs/future-enhancements.md, step 10). */
export function PinMapDialog({
  design,
  open,
  onOpenChange,
}: {
  design: DesignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [lang, setLang] = useState<Lang>('c')
  const { boards, board, setBoard } = useBoard(design)
  const { data, error, isPending } = useGetPinMap(
    design.id,
    { lang, ...(board && { board }) },
    // Always fresh: the design may have changed since it was last opened. The last map
    // stays up while switching language or board, so the dialog doesn't jump.
    { query: { enabled: open, staleTime: 0, placeholderData: keepPreviousData } },
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90svh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pin map</DialogTitle>
          <DialogDescription>
            Constants for firmware, from this design&apos;s wires: each part&apos;s pins by the
            board pin they&apos;re on, its I2C address and the buses. Include it instead of writing
            pin numbers, and generate it again after changing the wiring.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Language">
            {LANGS.map((option) => (
              <Button
                key={option.lang}
                variant={lang === option.lang ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={lang === option.lang}
                onClick={() => setLang(option.lang)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <BoardPicker boards={boards} board={board} onChange={setBoard} />
        </div>
        <FileText text={data?.text} error={error} loading={isPending && open} />
        <FileActions file={data} />
      </DialogContent>
    </Dialog>
  )
}
