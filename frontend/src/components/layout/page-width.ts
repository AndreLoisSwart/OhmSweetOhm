import { createContext, useContext, useEffect } from 'react'

/** reading: the default column. wide: the window's width. full: edge to edge, no padding,
 * filling the height too (the design canvas). */
export type PageWidth = 'reading' | 'wide' | 'full'

export const PageWidthContext = createContext<(width: PageWidth) => void>(() => {})

/** Lets a page use more of the window than the reading width. Reverts when it goes away. */
export function usePageWidth(width: PageWidth) {
  const setWidth = useContext(PageWidthContext)
  useEffect(() => {
    setWidth(width)
    return () => setWidth('reading')
  }, [setWidth, width])
}

/** The window's full width, e.g. for the pin editor beside its preview. */
export const useWidePage = () => usePageWidth('wide')
