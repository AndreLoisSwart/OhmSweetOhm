import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { useGetBringupSketch } from '@/api/generated/firmware/firmware'
import type { DesignDetail } from '@/api/generated/model'
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

/** A library-free Arduino sketch that checks the built circuit against the design
 * (docs/future-enhancements.md, step 11), with the pins.h it includes. */
export function BringupDialog({
  design,
  open,
  onOpenChange,
}: {
  design: DesignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { boards, board, setBoard } = useBoard(design)
  const [tab, setTab] = useState(0)
  const { data, error, isPending } = useGetBringupSketch(design.id, board ? { board } : undefined, {
    query: { enabled: open, staleTime: 0, placeholderData: keepPreviousData },
  })
  const file = data?.files[tab] ?? data?.files[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[90svh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bring-up sketch</DialogTitle>
          <DialogDescription>
            Checks the circuit you built against this design, with no libraries: I2C parts answer at
            their addresses, actuator and display pins blink, other parts are watched while you
            trigger them. Only actuator and display pins are driven. Save both files in a folder
            named <span className="font-mono">bringup</span>, upload, and open the serial monitor at
            115200 baud.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="File">
            {(data?.files ?? []).map((f, i) => (
              <Button
                key={f.filename}
                variant={file?.filename === f.filename ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={file?.filename === f.filename}
                className="font-mono"
                onClick={() => setTab(i)}
              >
                {f.filename}
              </Button>
            ))}
          </div>
          <BoardPicker boards={boards} board={board} onChange={setBoard} />
        </div>
        <FileText text={file?.text} error={error} loading={isPending && open} />
        <FileActions file={file} />
      </DialogContent>
    </Dialog>
  )
}
