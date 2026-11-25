import type { DesignDetail, NetOut, PinKind } from '@/api/generated/model'
import { partsById } from './model'

/**
 * Trace through (docs/pages.md): from a highlighted net, on through every series part
 * (resistor, inductor, ferrite: part.series) to the nets beyond, the whole chain. A trace
 * stops on reaching a supply or ground net, which only gets a tag on the series part's
 * pin, else it would light half the canvas; and at any part that isn't series.
 * Display only: the nets themselves never join through a series part.
 */
export interface TraceHop {
  /** The series part's ref, and its part's name. */
  through: string
  part: string
  /** The net reached, or null for a pin left unwired. */
  net: string | null
  /** That net's pins, or the one pin when the trace ends there. */
  pins: string[]
  /** The trace stops here: a supply or ground net, or an unwired pin. */
  end: boolean
}

export interface Trace {
  /** Pins (`ref.PIN`) lit faintly: on the nets beyond, and the series parts' far pins. */
  pins: Set<string>
  /** Series parts the trace passed through. */
  parts: Set<string>
  /** Where the trace stopped at a supply or ground: the series part's pin → net name. */
  ends: Map<string, string>
  hops: TraceHop[]
}

export const NO_TRACE: Trace = { pins: new Set(), parts: new Set(), ends: new Map(), hops: [] }

const RAIL_KINDS: ReadonlySet<PinKind> = new Set(['ground', 'power_out', 'power_in'])

/** A tracer for this design: from the highlighted pins to what lies through series parts. */
export function makeTracer(design: DesignDetail): (start: string[]) => Trace {
  const parts = partsById(design)
  const placements = new Map(design.placements.map((p) => [p.ref, parts.get(p.part_id)!]))
  const netOf = new Map<string, NetOut>()
  for (const net of design.nets) for (const key of net.pins) netOf.set(key, net)
  const kindOf = (key: string) => {
    const dot = key.indexOf('.')
    return placements.get(key.slice(0, dot))?.pins.find((p) => p.name === key.slice(dot + 1))?.kind
  }
  const isRail = (net: NetOut) => net.pins.some((key) => RAIL_KINDS.has(kindOf(key)!))

  return (start) => {
    if (!design.parts.some((p) => p.series)) return NO_TRACE
    const trace: Trace = { pins: new Set(), parts: new Set(), ends: new Map(), hops: [] }
    const seen = new Set(start)
    const queue = [start]
    while (queue.length) {
      for (const key of queue.shift()!) {
        const ref = key.slice(0, key.indexOf('.'))
        const part = placements.get(ref)
        if (!part?.series || trace.parts.has(ref)) continue
        trace.parts.add(ref)
        for (const pin of part.pins) {
          const far = `${ref}.${pin.name}`
          if (seen.has(far)) continue
          seen.add(far)
          trace.pins.add(far)
          const net = netOf.get(far)
          const hop = { through: ref, part: part.name, net: net?.name ?? null }
          if (!net) {
            trace.hops.push({ ...hop, pins: [far], end: true })
          } else if (isRail(net)) {
            trace.ends.set(far, net.name)
            trace.hops.push({ ...hop, pins: [far], end: true })
          } else {
            for (const other of net.pins) {
              seen.add(other)
              trace.pins.add(other)
            }
            trace.hops.push({ ...hop, pins: net.pins, end: false })
            queue.push(net.pins)
          }
        }
      }
    }
    return trace
  }
}
