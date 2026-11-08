/** What the checks bar asks the board to light up. */
export interface BoardHighlight {
  pins: Set<string>
  holes: Set<string>
}

export const NO_HIGHLIGHT: BoardHighlight = { pins: new Set(), holes: new Set() }

/** The drag MIME type for a placement dragged from the parts tray. */
export const PLACEMENT_MIME = 'application/x-ohm-placement'
