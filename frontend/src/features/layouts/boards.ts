import type { BoardType } from '@/api/generated/model'

/** The board types, with the size a new layout gets when none is typed. */
export const BOARDS: { type: BoardType; label: string; strips: number; holes: number }[] = [
  { type: 'stripboard', label: 'Stripboard', strips: 24, holes: 37 },
  { type: 'breadboard', label: 'Breadboard pattern', strips: 14, holes: 62 },
  { type: 'perfboard', label: 'Perfboard', strips: 24, holes: 30 },
]

export function boardName(type: BoardType): string {
  return BOARDS.find((b) => b.type === type)?.label ?? type
}

/** A breadboard pattern is the only board with a fixed layout: 14 rows, 2.54 mm. */
export function isFixed(type: BoardType): boolean {
  return type === 'breadboard'
}
