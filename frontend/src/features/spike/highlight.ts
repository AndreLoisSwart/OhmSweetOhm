import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'

/**
 * The highlighted net, outside React state: each card subscribes to just its own pins,
 * so hovering a pin re-renders only the cards whose highlight changes, not the whole
 * canvas. Hover follows the mouse; a tap or click pins a net (touch has no hover).
 */
export class HighlightStore {
  private hovered: string[] = []
  private pinned: string[] = []
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The highlighted pins (`ref.PIN`): the hovered net, else the pinned one. */
  current = () => (this.hovered.length ? this.hovered : this.pinned)

  hover(net: string[]) {
    this.hovered = net
    this.emit()
  }

  /** Pin a net, or unpin it when it is already pinned. */
  toggle(net: string[]) {
    this.pinned = this.pinned.join() === net.join() ? [] : net
    this.emit()
  }

  clear() {
    this.hovered = []
    this.pinned = []
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }
}

export const HighlightContext = createContext(new HighlightStore())

/** This card's highlighted pin names, joined into a string so unchanged cards bail out. */
export function useHighlightedPins(ref: string): Set<string> {
  const store = useContext(HighlightContext)
  const snapshot = useCallback(
    () =>
      store
        .current()
        .filter((key) => key.startsWith(`${ref}.`))
        .map((key) => key.slice(ref.length + 1))
        .join('\n'),
    [store, ref],
  )
  const joined = useSyncExternalStore(store.subscribe, snapshot)
  return new Set(joined ? joined.split('\n') : [])
}

/** The whole highlighted net, for wires and the inspector. */
export function useHighlightedNet(): string[] {
  const store = useContext(HighlightContext)
  return useSyncExternalStore(store.subscribe, store.current)
}

/** Whether a pin (`ref.PIN`) is in the highlighted net. Wires use it for their first end. */
export function useIsLit(key: string): boolean {
  const store = useContext(HighlightContext)
  return useSyncExternalStore(store.subscribe, () => store.current().includes(key))
}
