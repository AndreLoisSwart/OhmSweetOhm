import { useState } from 'react'
import type { DesignDetail } from '@/api/generated/model'

/** The design's boards by ref, and the one chosen (the first until another is picked). */
export function useBoard(design: DesignDetail) {
  const kinds = new Map(design.parts.map((p) => [p.id, p.kind]))
  const boards = design.placements
    .filter((p) => kinds.get(p.part_id) === 'board')
    .map((p) => p.ref)
    .sort()
  const [chosen, setChosen] = useState<string | null>(null)
  const board = chosen && boards.includes(chosen) ? chosen : boards[0]
  return { boards, board, setBoard: setChosen }
}
