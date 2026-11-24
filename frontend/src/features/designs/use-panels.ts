import { useCallback, useState } from 'react'

const LIBRARY_KEY = 'ohm.design.library-open'
const INSPECTOR_KEY = 'ohm.design.inspector-open'
const WIDTH_KEY = 'ohm.design.inspector-width'

/** The inspector's width on desktop, in px: dragged between these, 320 to start. */
export const INSPECTOR_MIN = 240
export const INSPECTOR_MAX = 560
const INSPECTOR_DEFAULT = 320

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private windows and blocked storage: the panels just don't remember.
  }
}

export const clampWidth = (px: number) =>
  Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, px)))

/**
 * Whether the design page's side panels are open on desktop (the parts library on the
 * left, the inspector on the right) and the inspector's width. Remembered in this
 * browser, for every design.
 */
export function usePanels() {
  const [library, setLibrary] = useState(() => read(LIBRARY_KEY) !== '0')
  const [inspector, setInspector] = useState(() => read(INSPECTOR_KEY) !== '0')
  const [width, setWidth] = useState(() => {
    const stored = Number(read(WIDTH_KEY))
    return stored ? clampWidth(stored) : INSPECTOR_DEFAULT
  })

  const toggleLibrary = useCallback(() => {
    setLibrary((open) => {
      write(LIBRARY_KEY, open ? '0' : '1')
      return !open
    })
  }, [])
  const toggleInspector = useCallback(() => {
    setInspector((open) => {
      write(INSPECTOR_KEY, open ? '0' : '1')
      return !open
    })
  }, [])
  /** While dragging: the new width. Saved once the drag ends (`save`). */
  const resize = useCallback((px: number, save = false) => {
    const next = clampWidth(px)
    setWidth(next)
    if (save) write(WIDTH_KEY, String(next))
  }, [])

  return { library, inspector, width, toggleLibrary, toggleInspector, resize }
}
