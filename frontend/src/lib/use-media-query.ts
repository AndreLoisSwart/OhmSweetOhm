import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches, kept current. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Phones get read-only designs in phase 1: narrow screens, or touch screens short in
 * landscape (docs/pages.md). */
export const PHONE_QUERY = '(max-width: 639px), (pointer: coarse) and (max-height: 480px)'
