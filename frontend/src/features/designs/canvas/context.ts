import { createContext } from 'react'
import type { Point } from './routing'

/** Pin hover and tap, handled by the canvas (it knows the nets). Stable for its life. */
export const PinEventsContext = createContext<{
  hover: (key: string | null) => void
  tap: (key: string) => void
}>({ hover: () => {}, tap: () => {} })

/** Each wire's routed corner points, by edge id. */
export const RoutesContext = createContext<Map<string, Point[]>>(new Map())

/** Fit, but never past 1.25×: labels are sized to be read at 1×. The padding leaves
 * room for wires that loop round the outside of the cards. */
export const FIT = { padding: 0.2, maxZoom: 1.25 }

/** On a phone, fitting a whole design makes labels unreadably small: fit no smaller than
 * 0.75× and let the user pan to the rest. */
export const PHONE_FIT = { padding: 0.1, minZoom: 0.75, maxZoom: 1.25 }

/** Library rows carry the part's id under this type when dragged onto the canvas. */
export const PART_DRAG_TYPE = 'application/x-ohm-part'
