import { Link } from 'react-router'
import type { PartSummary } from '@/api/generated/model'
import { TagChips } from '@/components/tag-chips'
import { plural } from '@/lib/format'
import { KindBadge, UnverifiedBadge } from './badges'
import { LOGIC_VOLTAGE_LABELS } from './labels'

export function PartRow({ part }: { part: PartSummary }) {
  return (
    <Link
      to={`/parts/${part.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{part.name}</span>
          {!part.verified && <UnverifiedBadge />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{LOGIC_VOLTAGE_LABELS[part.logic_voltage]}</span>
          <span>·</span>
          <span>{plural(part.pin_count, 'pin')}</span>
          <TagChips tags={part.tags} />
        </div>
      </div>
      <KindBadge kind={part.kind} />
    </Link>
  )
}
