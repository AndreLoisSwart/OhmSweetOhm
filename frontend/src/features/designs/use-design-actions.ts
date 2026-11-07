import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getGetDesignQueryKey,
  useAddPlacements,
  useAddWires,
  useRemovePlacement,
  useRemoveWire,
  useUpdateDesign,
  useUpdatePlacement,
  useUpdateWire,
} from '@/api/generated/designs/designs'
import type {
  DesignDetail,
  DesignUpdate,
  PlacementIn,
  PlacementUpdate,
  WireIn,
  WireUpdate,
} from '@/api/generated/model'

/**
 * Every change to a design, saved straight away. Each answer is the whole design, which
 * replaces the cached one, so the canvas redraws from what the server holds. A refused
 * change (shown as a toast) leaves the cache, and so the canvas, as it was.
 */
export function useDesignActions(designId: number) {
  const queryClient = useQueryClient()
  const options = {
    mutation: {
      onSuccess: (design: DesignDetail) =>
        queryClient.setQueryData(getGetDesignQueryKey(designId), design),
    },
  }
  const updateDesign = useUpdateDesign(options)
  const addPlacements = useAddPlacements(options)
  const updatePlacement = useUpdatePlacement(options)
  const removePlacement = useRemovePlacement(options)
  const addWires = useAddWires(options)
  const updateWire = useUpdateWire(options)
  const removeWire = useRemoveWire(options)

  return useMemo(
    () => ({
      updateDesign: (data: DesignUpdate) => updateDesign.mutateAsync({ designId, data }),
      addParts: (parts: PlacementIn[]) => addPlacements.mutateAsync({ designId, data: { parts } }),
      updatePlacement: (placementId: number, data: PlacementUpdate) =>
        updatePlacement.mutateAsync({ designId, placementId, data }),
      removePlacement: (placementId: number) =>
        removePlacement.mutateAsync({ designId, placementId }),
      connect: (wires: WireIn[]) => addWires.mutateAsync({ designId, data: { wires } }),
      updateWire: (wireId: number, data: WireUpdate) =>
        updateWire.mutateAsync({ designId, wireId, data }),
      removeWire: (wireId: number) => removeWire.mutateAsync({ designId, wireId }),
    }),
    // The mutate functions are stable; only the design changes what they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designId],
  )
}

export type DesignActions = ReturnType<typeof useDesignActions>

/** For fire-and-forget calls: errors are already shown as a toast by the mutation cache. */
export const quietly = (promise: Promise<unknown>) => void promise.catch(() => {})
