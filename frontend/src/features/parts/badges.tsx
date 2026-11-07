import { CircleAlert } from 'lucide-react'
import type { PartKind } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { PART_KIND_LABELS } from './labels'

export function KindBadge({ kind }: { kind: PartKind }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {PART_KIND_LABELS[kind]}
    </Badge>
  )
}

/** Parts that need checking against the maker's pinout (docs/data-model.md). */
export function UnverifiedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-status-amber/50 font-normal text-status-amber"
      title="Not yet checked against the maker's pinout"
    >
      <CircleAlert />
      Unverified
    </Badge>
  )
}
