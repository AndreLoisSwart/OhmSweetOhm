import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Saves a value shortly after the last change, and straight away on flush() or when
 * the component unmounts, so leaving the page doesn't lose the last edit.
 */
export function useAutosave(save: (value: string) => void, delay = 800) {
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (pending.current === null) return
    saveRef.current(pending.current)
    pending.current = null
    setDirty(false)
  }, [])

  const schedule = useCallback(
    (value: string) => {
      pending.current = value
      setDirty(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [flush, delay],
  )

  useEffect(() => flush, [flush])

  // Closing the tab mid-edit can't wait for a save, so ask first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return { schedule, flush, dirty }
}
