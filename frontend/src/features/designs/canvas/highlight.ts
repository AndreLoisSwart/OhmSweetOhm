import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import { NO_TRACE, type Trace } from './trace'

const TRACING_KEY = 'ohm.trace-through'

/** Trace through, as last set in this browser: shared by the schematic and the board. */
export function savedTracing(): boolean {
  try {
    return localStorage.getItem(TRACING_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTracing(on: boolean) {
  try {
    localStorage.setItem(TRACING_KEY, on ? '1' : '0')
  } catch {
    // A per-viewer convenience: without storage it just isn't remembered.
  }
}

/**
 * The highlighted net, outside React state: each card subscribes to just its own pins,
 * so hovering a pin re-renders only the cards whose highlight changes, not the whole
 * canvas. Hover follows the mouse; a tap or click pins a net (touch has no hover).
 * With trace through on (trace.ts), the nets beyond series parts are lit faintly too.
 */
export class HighlightStore {
  private hovered: string[] = []
  private pinned: string[] = []
  private tracer: ((start: string[]) => Trace) | null = null
  private tracingOn = savedTracing()
  private currentTrace = NO_TRACE
  private pinnedTraced = NO_TRACE
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The highlighted pins (`ref.PIN`): the hovered net, else the pinned one. */
  current = () => (this.hovered.length ? this.hovered : this.pinned)

  /** Only the net pinned by a tap or click, for panels that mustn't jump about on hover. */
  pinnedNet = () => this.pinned

  /** What the highlighted net reaches through series parts; empty with tracing off. */
  trace = () => this.currentTrace

  /** The same for the pinned net, for the inspector. */
  pinnedTrace = () => this.pinnedTraced

  tracing = () => this.tracingOn

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

  /** The design's tracer, set again whenever the design changes. */
  setTracer(tracer: (start: string[]) => Trace) {
    this.tracer = tracer
    this.emit()
  }

  setTracing(on: boolean) {
    this.tracingOn = on
    saveTracing(on)
    this.emit()
  }

  private traceFrom(start: string[]) {
    return this.tracingOn && this.tracer && start.length ? this.tracer(start) : NO_TRACE
  }

  private emit() {
    this.currentTrace = this.traceFrom(this.current())
    this.pinnedTraced =
      this.pinned === this.current() ? this.currentTrace : this.traceFrom(this.pinned)
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

export interface CardTrace {
  /** Whether the trace passes through this part. */
  through: boolean
  /** Pin name → the supply or ground net the trace stops at there, or null. */
  pins: Map<string, string | null>
}

/** This card's part of the trace, as a string snapshot so unchanged cards bail out. */
export function useCardTrace(ref: string): CardTrace {
  const store = useContext(HighlightContext)
  const snapshot = useCallback(() => {
    const trace = store.trace()
    const lines = [...trace.pins]
      .filter((key) => key.startsWith(`${ref}.`))
      .map((key) => `${key.slice(ref.length + 1)}\t${trace.ends.get(key) ?? ''}`)
    return `${trace.parts.has(ref) ? 1 : 0}\n${lines.join('\n')}`
  }, [store, ref])
  const [through, ...lines] = useSyncExternalStore(store.subscribe, snapshot).split('\n')
  return {
    through: through === '1',
    pins: new Map(
      lines.filter(Boolean).map((line) => {
        const [name, end] = line.split('\t')
        return [name, end || null]
      }),
    ),
  }
}

/** The net pinned by a tap or click (not hover), for the inspector. */
export function usePinnedNet(): string[] {
  const store = useContext(HighlightContext)
  return useSyncExternalStore(store.subscribe, store.pinnedNet)
}

/** The pinned net's trace, for the inspector. */
export function usePinnedTrace(): Trace {
  const store = useContext(HighlightContext)
  return useSyncExternalStore(store.subscribe, store.pinnedTrace)
}

/** Trace through on or off, and the switch. */
export function useTracing(): [boolean, (on: boolean) => void] {
  const store = useContext(HighlightContext)
  const on = useSyncExternalStore(store.subscribe, store.tracing)
  return [on, (next) => store.setTracing(next)]
}

/**
 * How a wire is lit: 'lit' in the highlighted net (its first end tells), 'traced' when
 * both ends are on a net reached through a series part (one end only is the wire on
 * from where the trace stopped at a supply), else null.
 */
export function useWireLight(a: string, b: string): 'lit' | 'traced' | null {
  const store = useContext(HighlightContext)
  return useSyncExternalStore(store.subscribe, () => {
    if (store.current().includes(a)) return 'lit'
    const { pins } = store.trace()
    return pins.has(a) && pins.has(b) ? 'traced' : null
  })
}
