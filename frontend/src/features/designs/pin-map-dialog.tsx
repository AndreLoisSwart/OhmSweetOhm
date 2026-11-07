import { Copy, Download } from 'lucide-react'
import { keepPreviousData } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/fetcher'
import { useGetPinMap } from '@/api/generated/firmware/firmware'
import type { DesignDetail, Lang } from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { copyText } from '@/lib/copy-text'

const LANGS: { lang: Lang; label: string }[] = [
  { lang: 'c', label: 'Arduino (pins.h)' },
  { lang: 'py', label: 'MicroPython (pins.py)' },
]

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
  const kinds = new Map(design.parts.map((p) => [p.id, p.kind]))
  const boards = design.placements
    .filter((p) => kinds.get(p.part_id) === 'board')
    .map((p) => p.ref)
    .sort()
  const [chosen, setChosen] = useState<string | null>(null)
  const board = chosen && boards.includes(chosen) ? chosen : boards[0]
  const { data, error, isPending } = useGetPinMap(
    design.id,
    { lang, ...(board && { board }) },
    // Always fresh: the design may have changed since it was last opened.
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
          {boards.length > 1 && (
            <label className="ml-auto flex items-center gap-2 text-sm">
              Board
              <NativeSelect
                value={board}
                onChange={(e) => setChosen(e.target.value)}
                className="font-mono"
              >
                {boards.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
        </div>
        {isPending && open ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : data ? (
          <pre className="min-h-0 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {data.text}
          </pre>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data}
            onClick={async () => {
              if (!data) return
              if (await copyText(data.text)) toast.success(`Copied ${data.filename}`)
              else toast.error("Couldn't copy; select the text instead")
            }}
          >
            <Copy />
            Copy
          </Button>
          <Button
            size="sm"
            disabled={!data}
            onClick={() => data && download(data.filename, data.text)}
          >
            <Download />
            Download {data?.filename ?? ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
