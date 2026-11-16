import { useCallback, useMemo, useState } from 'react'
import { suggestBuildOrder } from '@/api/generated/designs/designs'
import type { DesignDetail } from '@/api/generated/model'
import {
  buildSteps,
  numberClick,
  shownAt,
  type StepValue,
  stepIndex,
  stepShading,
} from './canvas/build-order'
import type { Shading } from './canvas/focus'
import { type DesignActions, quietly } from './use-design-actions'

const GHOST_KEY = 'ohm.build-order.ghost'

function readGhost() {
  try {
    return localStorage.getItem(GHOST_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The build order view (docs/pages.md, Build order): stepping through the design, and
 * numbering its parts by clicking them. A view only; the numbers are saved on the parts.
 */
export function useBuildOrder(design: DesignDetail, actions: DesignActions) {
  const [open, setOpen] = useState(false)
  const [numbering, setNumbering] = useState(false)
  // The step being shown, by its number, so it survives the numbers changing.
  const [wanted, setWanted] = useState<StepValue>(null)
  const [ghost, setGhostState] = useState(readGhost)
  // The step the last numbering click made.
  const [last, setLast] = useState(0)

  const steps = useMemo(() => buildSteps(design), [design])
  const index = steps.length ? stepIndex(steps, wanted) : -1
  const current = index >= 0 ? steps[index] : null
  const stepping = open && !numbering && current !== null

  const shading: Shading | null = useMemo(
    () => (stepping ? stepShading(design, current!.value) : null),
    [stepping, design, current],
  )
  // Hidden later steps: left out of the canvas altogether, so routes ignore them.
  const shown = useMemo(
    () => (stepping && !ghost ? shownAt(design, current!.value) : design),
    [stepping, ghost, design, current],
  )

  const go = useCallback(
    (by: number) => {
      if (!steps.length) return
      const at = Math.min(Math.max(index + by, 0), steps.length - 1)
      setWanted(steps[at].value)
    },
    [steps, index],
  )

  const startNumbering = () => {
    setLast(0)
    setNumbering(true)
  }

  return {
    open,
    numbering,
    steps,
    index,
    current,
    ghost,
    shading,
    shown,
    toggle: () => {
      setOpen((was) => !was)
      setNumbering(false)
      // Opens at the first step.
      setWanted(steps[0]?.value ?? null)
    },
    close: () => {
      setOpen(false)
      setNumbering(false)
    },
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
    startNumbering,
    stopNumbering: () => {
      setNumbering(false)
      setWanted(steps[0]?.value ?? null)
    },
    /** A click on a part while numbering: the next step, or (Shift) the one just made. */
    numberPart: (id: string, shift: boolean) => {
      const step = numberClick(last, shift)
      setLast(step)
      quietly(actions.updatePlacement(Number(id), { build_step: step }))
    },
    /** The next click's step, for the bar. */
    nextNumber: last + 1,
    suggest: async () => {
      const order = await suggestBuildOrder(design.id)
      await actions.setBuildOrder(order.steps)
      const numbers = order.steps.map((s) => s.step ?? 0)
      setLast(Math.max(0, ...numbers))
      // Start from the first step of the new order.
      setWanted(Math.min(...numbers))
    },
    clear: () => {
      setLast(0)
      return actions.setBuildOrder(design.placements.map((p) => ({ ref: p.ref, step: null })))
    },
  }
}

export type BuildOrder = ReturnType<typeof useBuildOrder>
