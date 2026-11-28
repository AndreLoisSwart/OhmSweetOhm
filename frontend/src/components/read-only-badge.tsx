import { Lock } from 'lucide-react'

/** The lock shown in a phone's header, where designs and layouts can't be edited. */
export function ReadOnlyBadge({ what }: { what: string }) {
  const label = `${what} are read-only on a phone`
  return (
    <span className="flex shrink-0 items-center px-1 text-muted-foreground" title={label}>
      <Lock className="size-3.5" aria-label={label} />
    </span>
  )
}
