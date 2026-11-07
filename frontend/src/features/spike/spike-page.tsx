// Canvas spike (build step 2 in docs/mvp.md). Throwaway: all state lives in this page,
// with two hard-coded parts. Findings are in docs/pages.md, "Canvas spike findings".
import '@xyflow/react/dist/style.css'
import './canvas.css'
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { cn } from 'cn'
import { ArrowLeft, Lock, LockOpen, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { PinEventsContext, WireStyleContext, type WireStyle } from './context'
import { HighlightContext, HighlightStore, useHighlightedNet } from './highlight'
import {
  computeNets,
  defaultWireColor,
  GRID,
  layoutCard,
  type Rotation,
  WIRE_COLORS,
  type WireColor,
} from './layout'
import { PartNode, type PartNodeType } from './part-node'
import { BME280, ESP32_DEVKIT_V1, type Part } from './parts'
import { WireEdge, type WireEdgeType } from './wire-edge'

const nodeTypes = { part: PartNode }
const edgeTypes = { wire: WireEdge }

const place = (ref: string, part: Part, x: number, y: number): PartNodeType => ({
  id: ref,
  type: 'part',
  position: { x, y },
  data: { ref, part, rotation: 0 },
})

const wire = (a: string, b: string, color: WireColor): WireEdgeType => {
  const [sa, ha] = a.split('.')
  const [sb, hb] = b.split('.')
  return {
    id: `${a}~${b}`,
    type: 'wire',
    source: sa,
    sourceHandle: ha,
    target: sb,
    targetHandle: hb,
    data: { a, b, color },
  }
}

const initialNodes = [place('esp', ESP32_DEVKIT_V1, 0, 0), place('bme', BME280, 360, 60)]
const initialEdges = [
  wire('esp.3V3', 'bme.VIN', 'red'),
  wire('esp.GND2', 'bme.GND', 'black'),
  wire('esp.GPIO22', 'bme.SCL', 'yellow'),
  wire('esp.GPIO21', 'bme.SDA', 'blue'),
]

/** Phones are read-only in phase 1: narrow screens, or touch screens short in landscape. */
const PHONE_QUERY = '(max-width: 639px), (pointer: coarse) and (max-height: 480px)'
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(PHONE_QUERY).matches,
  )
}

/** Fit, but never past 1.25×: labels are sized to be read at 1×. */
const FIT = { padding: 0.15, maxZoom: 1.25 }

const endOf = (nodeId: string, handle: string | null | undefined) => `${nodeId}.${handle}`

function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<PartNodeType>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<WireEdgeType>(initialEdges)
  const [store] = useState(() => new HighlightStore())
  const [wireStyle, setWireStyle] = useState<WireStyle>('smoothstep')
  const isPhone = useIsPhone()
  const [lockOverride, setLockOverride] = useState<boolean | null>(null)
  const readOnly = lockOverride ?? isPhone
  const { fitView } = useReactFlow()

  // Fit once every card has been measured. The `fitView` prop fires before custom nodes
  // with many handles finish measuring, and fits only the first card.
  const initialized = useNodesInitialized()
  const fitted = useRef(false)
  useEffect(() => {
    if (!initialized || fitted.current) return
    fitted.current = true
    void fitView(FIT)
  }, [initialized, fitView])

  // Nets are recomputed from the wires on every change, never stored.
  const nets = useMemo(() => computeNets(edges.map((e) => e.data!)), [edges])
  const netsRef = useRef(nets)
  useEffect(() => {
    netsRef.current = nets
    // A wire was added or removed: the highlighted net is stale.
    store.clear()
  }, [nets, store])

  const pinEvents = useMemo(
    () => ({
      hover: (key: string | null) => store.hover(key ? (netsRef.current.get(key) ?? [key]) : []),
      tap: (key: string) => store.toggle(netsRef.current.get(key) ?? [key]),
    }),
    [store],
  )

  const kindOf = useCallback(
    (nodeId: string, pin: string | null | undefined) =>
      nodes.find((n) => n.id === nodeId)?.data.part.pins.find((p) => p.name === pin)?.kind ??
      'other',
    [nodes],
  )

  // A wire from a pin to itself, or a second wire between the same two pins, is refused.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const a = endOf(c.source, c.sourceHandle)
      const b = endOf(c.target, c.targetHandle)
      if (a === b) return false
      return !edges.some(
        (e) => (e.data!.a === a && e.data!.b === b) || (e.data!.a === b && e.data!.b === a),
      )
    },
    [edges],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      const a = endOf(c.source, c.sourceHandle)
      const b = endOf(c.target, c.targetHandle)
      const color = defaultWireColor(
        kindOf(c.source, c.sourceHandle),
        kindOf(c.target, c.targetHandle),
        edges.length,
      )
      setEdges((es) => addEdge({ ...wire(a, b, color) }, es))
    },
    [edges.length, kindOf, setEdges],
  )

  // Rotate selected parts 90° clockwise about their centre, staying on the grid.
  const rotateSelected = useCallback(() => {
    setNodes((ns) =>
      ns.map((n) => {
        if (!n.selected) return n
        const rotation = ((n.data.rotation + 90) % 360) as Rotation
        const before = layoutCard(n.data.part, n.data.rotation)
        const after = layoutCard(n.data.part, rotation)
        const snap = (v: number) => Math.round(v / GRID) * GRID
        return {
          ...n,
          position: {
            x: snap(n.position.x + (before.width - after.width) / 2),
            y: snap(n.position.y + (before.height - after.height) / 2),
          },
          data: { ...n.data, rotation },
        }
      }),
    )
  }, [setNodes])

  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) rotateSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readOnly, rotateSelected])

  // Performance probe: add a row of ESP32s daisy-chained on I2C and power.
  const addStress = () => {
    const start = nodes.length
    const added = Array.from({ length: 10 }, (_, i) =>
      place(
        `esp${start + i}`,
        ESP32_DEVKIT_V1,
        ((start + i) % 6) * 300,
        420 + Math.floor((start + i) / 6) * 440,
      ),
    )
    const prev = [nodes.at(-1)!.id, ...added.map((n) => n.id)]
    const chain = added.flatMap((n, i) => [
      wire(`${prev[i]}.GND`, `${n.id}.GND`, 'black'),
      wire(`${prev[i]}.GPIO21`, `${n.id}.GPIO21`, 'blue'),
      wire(`${prev[i]}.GPIO22`, `${n.id}.GPIO22`, 'yellow'),
    ])
    // Wires from the BME280 use its own pin names.
    const fixed = chain.map((w) =>
      w.source === 'bme'
        ? wire(
            `bme.${{ GND: 'GND', GPIO21: 'SDA', GPIO22: 'SCL' }[w.sourceHandle!]}`,
            w.data!.b,
            w.data!.color,
          )
        : w,
    )
    setNodes((ns) => [...ns, ...added])
    setEdges((es) => [...es, ...fixed])
    setTimeout(() => void fitView({ ...FIT, duration: 300 }), 50)
  }

  const reset = () => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    setTimeout(() => void fitView({ ...FIT, duration: 300 }), 50)
  }

  return (
    <HighlightContext.Provider value={store}>
      <PinEventsContext.Provider value={pinEvents}>
        <WireStyleContext.Provider value={wireStyle}>
          <ReactFlow
            className={cn('ohm-canvas', readOnly && 'read-only')}
            colorMode="system"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={14}
            snapToGrid
            snapGrid={[GRID, GRID]}
            fitViewOptions={FIT}
            minZoom={0.2}
            maxZoom={3}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            // Otherwise a tap on a pin starts a wire even when nodesConnectable is off.
            connectOnClick={!readOnly}
            edgesReconnectable={false}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            onEdgeMouseEnter={(_, e) => store.hover(nets.get(e.data!.a) ?? [])}
            onEdgeMouseLeave={() => store.hover([])}
            onPaneClick={() => store.clear()}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID * 2} size={1.2} />
            <Controls showInteractive={false} />
            {!isPhone && <MiniMap pannable zoomable className="!bg-card" />}
            <Panel position="top-left" className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLockOverride(!readOnly)}
                title="Phones open read-only; this toggles it to try either mode"
              >
                {readOnly ? <Lock /> : <LockOpen />}
                {readOnly ? 'Read-only' : 'Editing'}
              </Button>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={rotateSelected} title="Rotate (R)">
                  <RotateCw />
                  Rotate
                </Button>
              )}
              <select
                aria-label="Wire routing"
                className="h-7 rounded-md border bg-card px-1.5 text-[0.8rem]"
                value={wireStyle}
                onChange={(e) => setWireStyle(e.target.value as WireStyle)}
              >
                <option value="smoothstep">Square wires</option>
                <option value="bezier">Curved wires</option>
                <option value="straight">Straight wires</option>
              </select>
              {!isPhone && (
                <>
                  <Button size="sm" variant="ghost" onClick={addStress}>
                    +10 boards
                  </Button>
                  <Button size="sm" variant="ghost" onClick={reset}>
                    Reset
                  </Button>
                </>
              )}
            </Panel>
            <Panel position={isPhone ? 'bottom-right' : 'top-right'}>
              <Inspector
                legend={!isPhone}
                part={nodes.find((n) => n.selected)}
                edge={edges.find((e) => e.selected)}
                readOnly={readOnly}
              />
            </Panel>
          </ReactFlow>
        </WireStyleContext.Provider>
      </PinEventsContext.Provider>
    </HighlightContext.Provider>
  )
}

const LEGEND: [string, string][] = [
  ['power', 'Power'],
  ['ground', 'Ground'],
  ['i2c', 'I2C'],
  ['spi', 'SPI'],
  ['uart', 'UART'],
  ['analog', 'Analog'],
  ['gpio', 'GPIO'],
]

/** Selected part or wire, the highlighted net, and a legend. Stand-in for the real Inspector. */
function Inspector({
  part,
  edge,
  readOnly,
  legend,
}: {
  part?: PartNodeType
  edge?: WireEdgeType
  readOnly: boolean
  /** Show the legend when nothing is selected; phones skip it to keep the canvas clear. */
  legend: boolean
}) {
  const { setEdges, deleteElements } = useReactFlow<PartNodeType, WireEdgeType>()
  const net = useHighlightedNet()
  const empty = !part && !edge && net.length === 0
  if (empty && !legend) return null

  const setColor = (color: WireColor) =>
    setEdges((es) => es.map((e) => (e.id === edge?.id ? { ...e, data: { ...e.data!, color } } : e)))

  return (
    <div className="w-56 space-y-2 rounded-lg border bg-card/95 p-2.5 text-xs shadow-sm backdrop-blur">
      {part && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold">{part.data.ref}</span>
            <span className="text-muted-foreground">{part.data.rotation}°</span>
          </div>
          <div className="text-muted-foreground">
            {part.data.part.name}, {part.data.part.pins.length} pins
          </div>
          {!readOnly && (
            <Button
              size="xs"
              variant="destructive"
              onClick={() => void deleteElements({ nodes: [part] })}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      )}
      {edge && !part && (
        <div className="space-y-1.5">
          <div className="font-mono">
            {edge.data!.a} ↔ {edge.data!.b}
          </div>
          <div className="flex flex-wrap gap-1">
            {WIRE_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                disabled={readOnly}
                onClick={() => setColor(c)}
                className={cn(
                  'size-5 rounded-full border-2 border-[var(--wire-outline)]',
                  edge.data!.color === c && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                )}
                style={{ background: `var(--wire-${c})` }}
              />
            ))}
          </div>
        </div>
      )}
      {net.length > 0 && (
        <div>
          <div className="mb-0.5 text-muted-foreground">Net</div>
          <div className="font-mono leading-4">{net.join(', ')}</div>
        </div>
      )}
      {empty && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {LEGEND.map(([group, label]) => (
              <span key={group} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: `var(--pin-${group})` }}
                />
                {label}
              </span>
            ))}
          </div>
          <div className="text-muted-foreground">
            Marks: <b>I</b> input only, <b>S</b> strapping, <b>F</b> flash. Hover or tap a pin for
            its net.
          </div>
        </div>
      )}
    </div>
  )
}

export function SpikePage() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button asChild size="icon-sm" variant="ghost">
          <Link to="/" aria-label="Back">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-semibold whitespace-nowrap">Canvas spike</h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          Throwaway: two hard-coded parts, nothing is saved
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
