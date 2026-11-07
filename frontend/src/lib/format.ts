/** A UTC timestamp from the API, as a local date. */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

/** e.g. "3 weeks ago", "yesterday", "just now". */
export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** e.g. "820 KB", "4.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The site's name for a link with no title, e.g. "example.com". */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** How long since a timestamp, without "ago": "10 days", "6 weeks", "4 months". */
export function durationSince(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000)
  if (days < 14) return plural(days, 'day')
  if (days < 12 * 7) return plural(Math.floor(days / 7), 'week')
  return plural(Math.floor(days / 30), 'month')
}

/** A whole number of days as weeks when it divides evenly: "3 weeks", "10 days". */
export const daysAsWeeks = (days: number) =>
  days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day')
