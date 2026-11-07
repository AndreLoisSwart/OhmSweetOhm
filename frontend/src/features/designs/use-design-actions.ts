import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  getGetDesignQueryKey,
  useAddPlacements,
  useAddWires,
  useApplyLayout,
  useRemovePlacement,
  useRemoveWire,
  useRestoreRevision,
  useUpdateDesign,
  useUpdatePlacement,
  useUpdateWire,
} from '@/api/generated/designs/designs'
import type {
  DesignDetail,
  DesignUpdate,
  PlacementIn,
  PlacementUpdate,
  Snapshot,
  WireIn,
  WireUpdate,
} from '@/api/generated/model'
import { snapshotOf } from './canvas/model'

/** How many steps undo remembers in an editing session. */
const UNDO_DEPTH = 50

/**
 * Every change to a design, saved straight away. Each answer is the whole design, which
 * replaces the cached one, so the canvas redraws from what the server holds. A refused
 * change (shown as a toast) leaves the cache, and so the canvas, as it was.
 *
 * Changes to placements and wires can be undone while the page is open: each records the
 * design as it was, and undo sends that back (PUT /layout). Revisions, kept on the
 * server, cover longer spans (History).
 */
export function useDesignActions(designId: number) {
  const queryClient = useQueryClient()
  const key = getGetDesignQueryKey(designId)
  // Versions of the design this page saved, to tell its own changes from others'.
  const own = useRef(new Set<string>())
  const options = {
    mutation: {
      onSuccess: (design: DesignDetail) => {
        own.current.add(design.updated_at)
        queryClient.setQueryData(key, design)
      },
    },
  }
  const updateDesign = useUpdateDesign(options)
  const addPlacements = useAddPlacements(options)
  const updatePlacement = useUpdatePlacement(options)
  const removePlacement = useRemovePlacement(options)
  const addWires = useAddWires(options)
  const updateWire = useUpdateWire(options)
  const removeWire = useRemoveWire(options)
  const applyLayout = useApplyLayout(options)
  const restoreRevision = useRestoreRevision(options)

  const stacks = useRef<{ undo: Snapshot[]; redo: Snapshot[] }>({ undo: [], redo: [] })
  // The stacks' sizes, as state, so the Undo and Redo buttons re-render.
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 })

  return useMemo(() => {
    const current = () => queryClient.getQueryData<DesignDetail>(key)
    const changed = () =>
      setSizes({ undo: stacks.current.undo.length, redo: stacks.current.redo.length })

    /** Runs one or more changes as a single undo step. */
    const step = async <T>(run: () => Promise<T>): Promise<T> => {
      const design = current()
      const result = await run()
      if (design) {
        stacks.current.undo = [...stacks.current.undo, snapshotOf(design)].slice(-UNDO_DEPTH)
        stacks.current.redo = []
        changed()
      }
      return result
    }

    const travel = async (from: 'undo' | 'redo', to: 'undo' | 'redo') => {
      const target = stacks.current[from].at(-1)
      const design = current()
      if (!target || !design) return
      await applyLayout.mutateAsync({ designId, data: target })
      stacks.current[from] = stacks.current[from].slice(0, -1)
      stacks.current[to] = [...stacks.current[to], snapshotOf(design)]
      changed()
    }

    const raw = {
      addParts: (parts: PlacementIn[]) => addPlacements.mutateAsync({ designId, data: { parts } }),
      updatePlacement: (placementId: number, data: PlacementUpdate) =>
        updatePlacement.mutateAsync({ designId, placementId, data }),
      removePlacement: (placementId: number) =>
        removePlacement.mutateAsync({ designId, placementId }),
      connect: (wires: WireIn[]) => addWires.mutateAsync({ designId, data: { wires } }),
      updateWire: (wireId: number, data: WireUpdate) =>
        updateWire.mutateAsync({ designId, wireId, data }),
      removeWire: (wireId: number) => removeWire.mutateAsync({ designId, wireId }),
    }
    type Raw = typeof raw

    return {
      // Not part of undo: the name, description, tags and links aren't in a layout.
      updateDesign: (data: DesignUpdate) => updateDesign.mutateAsync({ designId, data }),
      addParts: (...args: Parameters<Raw['addParts']>) => step(() => raw.addParts(...args)),
      updatePlacement: (...args: Parameters<Raw['updatePlacement']>) =>
        step(() => raw.updatePlacement(...args)),
      removePlacement: (...args: Parameters<Raw['removePlacement']>) =>
        step(() => raw.removePlacement(...args)),
      connect: (...args: Parameters<Raw['connect']>) => step(() => raw.connect(...args)),
      updateWire: (...args: Parameters<Raw['updateWire']>) => step(() => raw.updateWire(...args)),
      removeWire: (...args: Parameters<Raw['removeWire']>) => step(() => raw.removeWire(...args)),
      /** Several changes as one undo step, e.g. deleting a selection. */
      together: (run: (actions: Raw) => Promise<unknown>) => step(() => run(raw)),
      restore: (revisionId: number) =>
        step(() => restoreRevision.mutateAsync({ designId, revisionId })),
      /** Whether this page made the change that produced this version of the design. */
      isOwn: (updatedAt: string) => own.current.has(updatedAt),
      /** Someone else changed the design: the undo steps no longer apply. */
      forgetUndo: () => {
        stacks.current = { undo: [], redo: [] }
        changed()
      },
      undo: () => travel('undo', 'redo'),
      redo: () => travel('redo', 'undo'),
      canUndo: sizes.undo > 0,
      canRedo: sizes.redo > 0,
    }
    // The mutate functions are stable; the stacks' sizes decide canUndo and canRedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId, sizes])
}

export type DesignActions = ReturnType<typeof useDesignActions>

/** For fire-and-forget calls: errors are already shown as a toast by the mutation cache. */
export const quietly = (promise: Promise<unknown>) => void promise.catch(() => {})
