import { useCallback, useMemo, useState } from 'react'
import type { DesignDetail, LayoutDetail } from '@/api/generated/model'
import {
  type BoardShading,
  boardShading,
  boardSteps,
  layoutAt,
  type StepValue,
  stepIndex,
} from './board/build-steps'

// The schematic's switch: ghosting later steps is remembered once for both views.
const GHOST_KEY = 'ohm.build-order.ghost'

function readGhost() {
  try {
    return localStorage.getItem(GHOST_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Stepping through the design's build order on the board (docs/pages.md, Layout page).
 * A view only: the order lives on the design's parts, and the board's own steps are
 * worked out by the server.
 */
export function useBoardBuild(layout: LayoutDetail, design: DesignDetail) {
  const [open, setOpen] = useState(false)
  // The step being shown, by its number, so it survives the steps changing.
  const [wanted, setWanted] = useState<StepValue>(0)
  const [ghost, setGhostState] = useState(readGhost)

  const steps = useMemo(() => boardSteps(layout, design), [layout, design])
  const index = steps.length ? stepIndex(steps, wanted) : -1
  const current = index >= 0 ? steps[index] : null
  const stepping = open && current !== null

  /** What the board shows: everything, or the board as it is by the current step. */
  const shown = useMemo(
    () => (stepping ? layoutAt(layout, design, current!.value, ghost) : layout),
    [stepping, layout, design, current, ghost],
  )
  const shading: BoardShading | null = useMemo(
    () => (stepping ? boardShading(layout, design, current!.value) : null),
    [stepping, layout, design, current],
  )

  const go = useCallback(
    (by: number) => {
      if (!steps.length) return
      setWanted(steps[Math.min(Math.max(index + by, 0), steps.length - 1)].value)
    },
    [steps, index],
  )

  return {
    open,
    steps,
    index,
    current,
    ghost,
    shown,
    shading,
    toggle: () => {
      setOpen((was) => !was)
      // Opens at the first step.
      setWanted(steps[0]?.value ?? 0)
    },
    close: () => setOpen(false),
    prev: () => go(-1),
    next: () => go(1),
    setGhost: (on: boolean) => {
      setGhostState(on)
      try {
        localStorage.setItem(GHOST_KEY, on ? '1' : '0')
      } catch {
        // Not remembered, that's all.
      }
    },
  }
}

export type BoardBuild = ReturnType<typeof useBoardBuild>
