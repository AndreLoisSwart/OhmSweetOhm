import { Download, File, FileText, Image, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  getGetAttachmentFileUrl,
  useDeleteAttachment,
  useListAttachments,
  useUploadAttachment,
} from '@/api/generated/attachments/attachments'
import type { AttachmentOut, OwnerType } from '@/api/generated/model'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/base-path'
import { formatBytes, formatDate } from '@/lib/format'

// Mirrors the server's default limit, to fail fast. The server's limit is the one enforced.
const MAX_MB = 50

type Props = { ownerType: OwnerType; ownerId: number }

function FileIcon({ attachment }: { attachment: AttachmentOut }) {
  const Icon = attachment.mime_type.startsWith('image/')
    ? Image
    : attachment.mime_type === 'application/pdf'
      ? FileText
      : File
  return <Icon className="size-4 shrink-0 text-muted-foreground" />
}

function AttachmentRow({ attachment }: { attachment: AttachmentOut }) {
  const deleteAttachment = useDeleteAttachment()
  const url = apiUrl(getGetAttachmentFileUrl(attachment.id))
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <FileIcon attachment={attachment} />
      <div className="min-w-0 flex-1">
        {/* PDFs and plain images open in a tab; anything else downloads (the server
            enforces this too). */}
        <a
          href={url}
          {...(attachment.viewable
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : { download: attachment.original_filename })}
          className="block truncate text-sm font-medium underline-offset-4 hover:underline"
        >
          {attachment.original_filename}
        </a>
        <div className="text-xs text-muted-foreground">
          {formatBytes(attachment.size)} · {formatDate(attachment.created_at)}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={url}
          download={attachment.original_filename}
          aria-label={`Download ${attachment.original_filename}`}
        >
          <Download />
        </a>
      </Button>
      <ConfirmDialog
        title={`Delete ${attachment.original_filename}?`}
        description="The file is removed for good."
        onConfirm={() => deleteAttachment.mutate({ attachmentId: attachment.id })}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${attachment.original_filename}`}
          >
            <Trash2 />
          </Button>
        }
      />
    </li>
  )
}

/** Uploaded files (datasheets, pinout images) of one part. */
export function AttachmentList({ ownerType, ownerId }: Props) {
  const { data: attachments = [] } = useListAttachments({
    owner_type: ownerType,
    owner_id: ownerId,
  })
  const uploadAttachment = useUploadAttachment()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)

  const upload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name} is over ${MAX_MB} MB`)
        continue
      }
      setUploading((n) => n + 1)
      try {
        await uploadAttachment.mutateAsync({
          data: { owner_type: ownerType, owner_id: ownerId, file },
        })
      } catch {
        // Shown by the global error toast; carry on with the other files.
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">Files</h2>
      {attachments.length > 0 && (
        <ul className="-mx-3 mb-3 divide-y">
          {attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files)
          e.target.value = ''
        }}
      />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={uploading > 0}>
        {uploading > 0 ? <Loader2 className="animate-spin" /> : <Upload />}
        {uploading > 0 ? 'Uploading…' : 'Upload files'}
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">Up to {MAX_MB} MB each.</p>
    </section>
  )
}
