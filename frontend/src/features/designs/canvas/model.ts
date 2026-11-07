// From the API's design to React Flow's nodes and edges, and the router's input. Pure.
import type { Edge, Node } from '@xyflow/react'
import type {
  CanvasPart,
  DesignDetail,
  NetOut,
  PlacementOut,
  Snapshot,
  WireOut,
} from '@/api/generated/model'
import { GRID, layoutCard, type Rotation } from '@/features/parts/card/layout'
import type { Point, Rect, WireToRoute } from './routing'

export type PartNodeData = { placement: PlacementOut; part: CanvasPart }
export type PartNodeType = Node<PartNodeData, 'part'>
export type WireEdgeData = { wire: WireOut }
export type WireEdgeType = Edge<WireEdgeData, 'wire'>

/** `esp.GPIO21` → `GPIO21`. */
export const pinName = (key: string) => key.slice(key.indexOf('.') + 1)

export const partsById = (design: DesignDetail) =>
  new Map(design.parts.map((part) => [part.id, part]))

/** Nodes for the placements, keeping which were selected. */
export function buildNodes(design: DesignDetail, previous: PartNodeType[]): PartNodeType[] {
  const parts = partsById(design)
  const selected = new Set(previous.filter((n) => n.selected).map((n) => n.id))
  return design.placements.map((placement) => {
    const id = String(placement.id)
    return {
      id,
      type: 'part',
      position: { x: placement.x, y: placement.y },
      data: { placement, part: parts.get(placement.part_id)! },
      selected: selected.has(id),
    }
  })
}

/** Edges for the wires, keeping which were selected. */
export function buildEdges(design: DesignDetail, previous: WireEdgeType[]): WireEdgeType[] {
  const selected = new Set(previous.filter((e) => e.selected).map((e) => e.id))
  return design.wires.map((wire) => {
    const id = String(wire.id)
    return {
      id,
      type: 'wire',
      source: String(wire.a_placement_id),
      sourceHandle: pinName(wire.a),
      target: String(wire.b_placement_id),
      targetHandle: pinName(wire.b),
      data: { wire },
      selected: selected.has(id),
    }
  })
}

/** Each wired pin's net, by `ref.PIN`. */
export function netsByPin(design: DesignDetail): Map<string, NetOut> {
  return new Map(design.nets.flatMap((net) => net.pins.map((pin) => [pin, net] as const)))
}

/** Cards and wire ends for the router, from the saved positions. */
export function routeInput(design: DesignDetail): { cards: Rect[]; wires: WireToRoute[] } {
  const parts = partsById(design)
  const layouts = new Map(
    design.placements.map((p) => [
      p.id,
      { placement: p, layout: layoutCard(parts.get(p.part_id)!, p.rotation as Rotation) },
    ]),
  )
  const cards = [...layouts.values()].map(({ placement, layout }) => ({
    x: placement.x,
    y: placement.y,
    width: layout.width,
    height: layout.height,
  }))
  const end = (placementId: number, key: string) => {
    const { placement, layout } = layouts.get(placementId)!
    const slot = layout.slots.find((s) => s.pin.name === pinName(key))!
    return { x: placement.x + slot.x, y: placement.y + slot.y, side: slot.side }
  }
  const wires = design.wires.map((w) => ({
    id: String(w.id),
    a: end(w.a_placement_id, w.a),
    b: end(w.b_placement_id, w.b),
  }))
  return { cards, wires }
}

/** The next quarter turn clockwise, keeping the card's centre where it was, on the grid. */
export function turned(placement: PlacementOut, part: CanvasPart) {
  const rotation = ((placement.rotation + 90) % 360) as Rotation
  const before = layoutCard(part, placement.rotation as Rotation)
  const after = layoutCard(part, rotation)
  const snap = (v: number) => Math.round(v / GRID) * GRID
  return {
    rotation,
    x: snap(placement.x + (before.width - after.width) / 2),
    y: snap(placement.y + (before.height - after.height) / 2),
  }
}

/**
 * Where to put a part added with + (no drop point): at `at` if that's clear, else the
 * nearest clear spot to its right. `size` is a rough card size; the gap leaves room for
 * wires between cards.
 */
export function freeSpot(
  cards: Rect[],
  at: Point,
  size = { width: 200, height: 180 },
  gap = 40,
): Point {
  const snap = (v: number) => Math.round(v / GRID) * GRID
  const clear = (x: number, y: number) =>
    cards.every(
      (c) =>
        x + size.width + gap <= c.x ||
        x >= c.x + c.width + gap ||
        y + size.height + gap <= c.y ||
        y >= c.y + c.height + gap,
    )
  const y = snap(at.y)
  for (let x = snap(at.x); x < snap(at.x) + 5000; x += GRID * 2) if (clear(x, y)) return { x, y }
  return { x: snap(at.x), y }
}

/** The design's placements and wires, as undo sends them back (PUT /layout). */
export function snapshotOf(design: DesignDetail): Snapshot {
  return {
    placements: design.placements.map(({ ref, part_id, x, y, rotation, note }) => ({
      ref,
      part_id,
      x,
      y,
      rotation,
      note,
    })),
    wires: design.wires.map(({ a, b, a_pin_id, b_pin_id, color, label }) => ({
      a,
      b,
      a_pin_id,
      b_pin_id,
      color,
      label,
    })),
  }
}
