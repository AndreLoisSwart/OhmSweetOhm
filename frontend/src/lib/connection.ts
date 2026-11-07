import { useSyncExternalStore } from 'react'

// Whether the last request reached the app. Set from the query client in main.tsx.
let online = true
const listeners = new Set<() => void>()

export function setOnline(next: boolean) {
  if (next === online) return
  online = next
  listeners.forEach((listener) => listener())
}

export function onConnectionChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const isOnline = () => online

export function useOnline() {
  return useSyncExternalStore(onConnectionChange, isOnline)
}
