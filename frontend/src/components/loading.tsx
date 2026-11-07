import { Skeleton } from '@/components/ui/skeleton'

// Placeholders in the shape of what's loading, so a slow connection (e.g. over the VPN
// on mobile data) doesn't look like an empty or broken page.

/** Rows, as in the items, notes and shopping lists. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-4 py-1" aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Cards, as on the projects page and Home. */
export function CardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy aria-label="Loading">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  )
}

/** A detail page: title, a line of details, then content. */
export function DetailSkeleton() {
  return (
    <div className="grid gap-4" aria-busy aria-label="Loading">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
      <Skeleton className="mt-4 h-40 rounded-lg" />
    </div>
  )
}
