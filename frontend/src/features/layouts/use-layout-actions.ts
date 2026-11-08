import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  getGetLayoutQueryKey,
  useAddConnector,
  useAddCuts,
  useAddJumper,
  useCutBetweenRows,
  useApplyLayoutSnapshot,
  usePlaceParts,
  useRemoveConnector,
  useRemoveCut,
  useRemoveJumper,
  useRestoreLayoutRevision,
  useTrimDeadCopper,
  useUnplacePart,
  useUpdateConnector,
  useUpdateJumper,
  useUpdateLayout,
} from '@/api/generated/layouts/layouts'
import type {
  ConnectorIn,
  ConnectorUpdate,
  CutIn,
  JumperIn,
  JumperUpdate,
  LayoutDetail,
  LayoutSnapshot,
  LayoutUpdate,
  PartPlace,
} from '@/api/generated/model'
import { snapshotOf } from './board/geometry'

const UNDO_DEPTH = 50

/**
 * Every change to a layout, saved straight away, as useDesignActions does for designs:
 * each answer is the whole layout and replaces the cached one. Changes can be undone
 * while the page is open: each records the layout as it was, and undo sends it back.
 */
export function useLayoutActions(layoutId: number) {
  const queryClient = useQueryClient()
  const key = getGetLayoutQueryKey(layoutId)
  const own = useRef(new Set<string>())
  const options = {
    mutation: {
      onSuccess: (layout: LayoutDetail) => {
        own.current.add(layout.updated_at)
        queryClient.setQueryData(key, layout)
      },
    },
  }
  const updateLayout = useUpdateLayout(options)
  const placeParts = usePlaceParts(options)
  const unplacePart = useUnplacePart(options)
  const addCuts = useAddCuts(options)
  const removeCut = useRemoveCut(options)
  const addJumper = useAddJumper(options)
  const updateJumper = useUpdateJumper(options)
  const removeJumper = useRemoveJumper(options)
  const addConnector = useAddConnector(options)
  const updateConnector = useUpdateConnector(options)
  const removeConnector = useRemoveConnector(options)
  const applySnapshot = useApplyLayoutSnapshot(options)
  const restoreRevision = useRestoreLayoutRevision(options)
  const cutBetweenRows = useCutBetweenRows(options)
  const trimDeadCopper = useTrimDeadCopper(options)

  const stacks = useRef<{ undo: LayoutSnapshot[]; redo: LayoutSnapshot[] }>({ undo: [], redo: [] })
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 })

  return useMemo(() => {
    const current = () => queryClient.getQueryData<LayoutDetail>(key)
    const changed = () =>
      setSizes({ undo: stacks.current.undo.length, redo: stacks.current.redo.length })
    const step = async <T>(run: () => Promise<T>): Promise<T> => {
      const layout = current()
      const result = await run()
      if (layout) {
        stacks.current.undo = [...stacks.current.undo, snapshotOf(layout)].slice(-UNDO_DEPTH)
        stacks.current.redo = []
        changed()
      }
      return result
    }
    const travel = async (from: 'undo' | 'redo', to: 'undo' | 'redo') => {
      const target = stacks.current[from].at(-1)
      const layout = current()
      if (!target || !layout) return
      await applySnapshot.mutateAsync({ layoutId, data: target })
      stacks.current[from] = stacks.current[from].slice(0, -1)
      stacks.current[to] = [...stacks.current[to], snapshotOf(layout)]
      changed()
    }

    return {
      // Not part of undo: the name and notes aren't in a snapshot.
      update: (data: LayoutUpdate) => updateLayout.mutateAsync({ layoutId, data }),
      place: (parts: PartPlace[]) =>
        step(() => placeParts.mutateAsync({ layoutId, data: { parts } })),
      unplace: (placementId: number) =>
        step(() => unplacePart.mutateAsync({ layoutId, placementId })),
      addCuts: (cuts: CutIn[]) => step(() => addCuts.mutateAsync({ layoutId, data: { cuts } })),
      removeCut: (cutId: number) => step(() => removeCut.mutateAsync({ layoutId, cutId })),
      cutBetweenRows: (placementId: number) =>
        step(() => cutBetweenRows.mutateAsync({ layoutId, placementId })),
      trim: () => step(() => trimDeadCopper.mutateAsync({ layoutId })),
      addJumper: (data: JumperIn) => step(() => addJumper.mutateAsync({ layoutId, data })),
      updateJumper: (jumperId: number, data: JumperUpdate) =>
        step(() => updateJumper.mutateAsync({ layoutId, jumperId, data })),
      removeJumper: (jumperId: number) =>
        step(() => removeJumper.mutateAsync({ layoutId, jumperId })),
      addConnector: (data: ConnectorIn) => step(() => addConnector.mutateAsync({ layoutId, data })),
      updateConnector: (connectorId: number, data: ConnectorUpdate) =>
        step(() => updateConnector.mutateAsync({ layoutId, connectorId, data })),
      removeConnector: (connectorId: number) =>
        step(() => removeConnector.mutateAsync({ layoutId, connectorId })),
      restore: (revisionId: number) =>
        step(() => restoreRevision.mutateAsync({ layoutId, revisionId })),
      isOwn: (updatedAt: string) => own.current.has(updatedAt),
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
  }, [layoutId, sizes])
}

export type LayoutActions = ReturnType<typeof useLayoutActions>
