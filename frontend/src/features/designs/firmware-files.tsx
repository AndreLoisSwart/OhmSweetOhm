// Shared by the Pin map and Bring-up dialogs: choosing the board, and showing a
// generated file with Copy and Download.
import { Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/fetcher'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/copy-text'

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A board picker, shown only when the design has more than one. */
export function BoardPicker({
  boards,
  board,
  onChange,
}: {
  boards: string[]
  board?: string
  onChange: (ref: string) => void
}) {
  if (boards.length < 2) return null
  return (
    <label className="ml-auto flex items-center gap-2 text-sm">
      Board
      <NativeSelect value={board} onChange={(e) => onChange(e.target.value)} className="font-mono">
        {boards.map((ref) => (
          <option key={ref} value={ref}>
            {ref}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}

/** The file's text, or loading, or why it couldn't be made. */
export function FileText({
  text,
  error,
  loading,
}: {
  text?: string
  error: unknown
  loading: boolean
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error)
    return (
      <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {errorMessage(error)}
      </p>
    )
  if (text === undefined) return null
  return (
    <pre className="min-h-0 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  )
}

export function FileActions({ file }: { file?: { filename: string; text: string } }) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!file}
        onClick={async () => {
          if (!file) return
          if (await copyText(file.text)) toast.success(`Copied ${file.filename}`)
          else toast.error("Couldn't copy; select the text instead")
        }}
      >
        <Copy />
        Copy
      </Button>
      <Button size="sm" disabled={!file} onClick={() => file && download(file.filename, file.text)}>
        <Download />
        Download {file?.filename ?? ''}
      </Button>
    </div>
  )
}
