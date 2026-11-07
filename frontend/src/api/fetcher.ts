import { apiUrl } from '../lib/base-path'

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API request failed with status ${status}`)
  }
}

// Used by every generated API call. Prefixes the base path so requests work behind
// HA Ingress, and throws on error responses so TanStack Query treats them as errors.
export const apiFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const res = await fetch(apiUrl(url), options)
  const text = await res.text()
  if (!res.ok) throw new ApiError(res.status, parseJson(text))
  return (text ? JSON.parse(text) : undefined) as T
}

// Error pages from Ingress or a proxy are HTML, not JSON.
function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return text
  }
}

/** The request never reached the app: no network, or Ingress couldn't reach the add-on
 * (e.g. while it restarts). Not an error in the request itself. */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof ApiError) return [502, 503, 504].includes(error.status)
  return error instanceof TypeError // what fetch throws when the network fails
}

// Picked up by orval as the error type of every generated hook. It must be generic.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ErrorType<_Error> = ApiError

/** A message fit to show the user, e.g. in a toast. */
export function errorMessage(error: unknown): string {
  if (isConnectionError(error)) return "Can't reach Ohm Sweet Ohm"
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    // FastAPI validation errors: a list, each with a message. Show the first one.
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') {
      return validationMessage(detail[0] as ValidationIssue)
    }
    if (error.status === 422) return 'Some of the values are not valid'
    return `Something went wrong (${error.status})`
  }
  return 'Something went wrong'
}

type ValidationIssue = { type?: string; loc?: (string | number)[]; msg: string }

// What a field must look like, for the patterns the API checks (say it plainly instead
// of showing the regular expression).
const PATTERNS: Record<string, string> = {
  name: "Pin names can't have spaces or dots (pins are named ref.PIN)",
  ref: 'A ref starts with a letter, then letters, digits or _ (up to 20)',
  new_ref: 'A ref starts with a letter, then letters, digits or _ (up to 20)',
  a: 'Wire ends are written ref.PIN, e.g. esp.GPIO21',
  b: 'Wire ends are written ref.PIN, e.g. esp.GPIO21',
}

/** "Supply max v: must be at most 60" rather than pydantic's wording alone. */
export function validationMessage(issue: ValidationIssue): string {
  const field = [...(issue.loc ?? [])].reverse().find((part) => typeof part === 'string')
  const msg = issue.msg.replace(/^Value error, /, '')
  if (issue.type === 'string_pattern_mismatch' && field && PATTERNS[field]) return PATTERNS[field]
  // Errors raised by the API's own rules read as sentences already.
  if (issue.type === 'value_error' || !field || ['body', 'query', 'path'].includes(field))
    return msg
  const label = field.replace(/_/g, ' ').replace(/\bv\b/, 'V')
  return `${label[0].toUpperCase()}${label.slice(1)}: ${msg[0].toLowerCase()}${msg.slice(1)}`
}
