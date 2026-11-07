import { WifiOff } from 'lucide-react'
import { useGetHealth } from '@/api/generated/health/health'
import { useOnline } from '@/lib/connection'

/** Shown while Ohm Sweet Ohm can't be reached, e.g. the add-on is restarting or the VPN
 * dropped. Checks every few seconds, and the page refreshes itself once it's back. */
export function ConnectionBanner() {
  const online = useOnline()
  // Its success is what marks the connection as back (see main.tsx).
  useGetHealth({ query: { enabled: !online, refetchInterval: 5000, retry: false } })
  if (online) return null
  return (
    <div
      role="status"
      className="sticky top-14 z-10 md:top-0 flex items-center justify-center gap-2 bg-status-amber/15 px-4 py-2 text-sm text-status-amber backdrop-blur"
    >
      <WifiOff className="size-4 shrink-0" />
      Can't reach Ohm Sweet Ohm. Retrying…
    </div>
  )
}
