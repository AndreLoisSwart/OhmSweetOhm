import { createContext } from 'react'

/** Pin hover and tap, handled by the page (it knows the nets). Stable for the page's life. */
export const PinEventsContext = createContext<{
  hover: (key: string | null) => void
  tap: (key: string) => void
}>({ hover: () => {}, tap: () => {} })

export type WireStyle = 'smoothstep' | 'bezier' | 'straight'

/** How wires are routed; a spike toggle to compare the three. */
export const WireStyleContext = createContext<WireStyle>('smoothstep')
