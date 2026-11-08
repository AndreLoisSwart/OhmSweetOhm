import { keepPreviousData, type UseQueryOptions, useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import {
  getGetBringupSketchQueryOptions,
  getGetPlatformioProjectQueryOptions,
  getGetWokwiExportQueryOptions,
} from '@/api/generated/firmware/firmware'
import type { DesignDetail, FirmwareFiles, WokwiExport, WokwiSkipped } from '@/api/generated/model'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BoardPicker, FileActions, FileText } from './firmware-files'
import { cn } from '@/lib/utils'
import { useBoard } from './use-board'

export type FirmwareFilesKind = 'bringup' | 'platformio' | 'wokwi'

const QUERIES = {
  bringup: getGetBringupSketchQueryOptions,
  platformio: getGetPlatformioProjectQueryOptions,
  wokwi: getGetWokwiExportQueryOptions,
}

const TEXT: Record<FirmwareFilesKind, { title: string; description: ReactNode }> = {
  // docs/future-enhancements.md, step 11
  bringup: {
    title: 'Bring-up sketch',
    description: (
      <>
        Checks the circuit you built against this design, with no libraries: I2C parts answer at
        their addresses, actuator and display pins blink, other parts are watched while you trigger
        them. Only actuator and display pins are driven. Save both files in a folder named{' '}
        <span className="font-mono">bringup</span>, upload, and open the serial monitor at 115200
        baud.
      </>
    ),
  },
  // Step 12
  platformio: {
    title: 'PlatformIO project',
    description: (
      <>
        The board&apos;s platform and board id, and the libraries this design&apos;s parts need on
        it. Save it at the root of a PlatformIO project, next to{' '}
        <span className="font-mono">src/</span>. The Arduino IDE names of the libraries are in its
        comments.
      </>
    ),
  },
  // Phase 2: simulation
  wokwi: {
    title: 'Simulate in Wokwi',
    description: (
      <>
        This design as a Wokwi diagram. In the browser: start a new project on wokwi.com for the
        same board and paste <span className="font-mono">diagram.json</span> over its own. In VS
        Code: save both files next to <span className="font-mono">platformio.ini</span>, build with{' '}
        <span className="font-mono">pio run</span>, and start the Wokwi simulator.
      </>
    ),
  },
}

/** Parts the Wokwi export left out: their part has no Wokwi type. */
function Skipped({ skipped }: { skipped: WokwiSkipped[] }) {
  if (!skipped.length) return null
  return (
    <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
      Left out (no Wokwi type set on the part, or Wokwi doesn&apos;t have it):{' '}
      {skipped.map((s, i) => (
        <span key={s.ref}>
          {i > 0 && ', '}
          <span className="font-mono text-foreground">{s.ref}</span> ({s.part}
          {s.wires > 0 && `, ${s.wires} wire${s.wires === 1 ? '' : 's'}`})
        </span>
      ))}
      .
    </p>
  )
}

/** Generated files for the design's board, one tab per file, with Copy and Download. */
export function FirmwareFilesDialog({
  kind,
  design,
  open,
  onOpenChange,
}: {
  kind: FirmwareFilesKind
  design: DesignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { boards, board, setBoard } = useBoard(design)
  const [tab, setTab] = useState(0)
  const { data, error, isPending } = useQuery(
    QUERIES[kind](design.id, board ? { board } : undefined, {
      // Always fresh: the design may have changed since it was last opened.
      query: { enabled: open, staleTime: 0, placeholderData: keepPreviousData },
    }) as UseQueryOptions<FirmwareFiles | WokwiExport>,
  )
  const file = data?.files[tab] ?? data?.files[0]
  const skipped = data && 'skipped' in data ? data.skipped : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'grid max-h-[90svh] sm:max-w-2xl',
          skipped.length
            ? 'grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]'
            : 'grid-rows-[auto_auto_minmax(0,1fr)_auto]',
        )}
      >
        <DialogHeader>
          <DialogTitle>{TEXT[kind].title}</DialogTitle>
          <DialogDescription>{TEXT[kind].description}</DialogDescription>
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
        <Skipped skipped={skipped} />
        <FileText text={file?.text} error={error} loading={isPending && open} />
        <FileActions file={file} />
      </DialogContent>
    </Dialog>
  )
}
