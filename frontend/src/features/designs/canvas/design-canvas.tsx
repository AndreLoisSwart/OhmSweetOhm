import '@xyflow/react/dist/style.css'
import './canvas.css'
import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  Controls,
  type Edge,
  MiniMap,
  type OnEdgesChange,
  type OnNodesChange,
  Panel,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  ViewportPortal,
} from '@xyflow/react'
import { cn } from 'cn'
import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { DesignDetail } from '@/api/generated/model'
import { GRID } from '@/features/parts/card/layout'
import { type DesignActions, quietly } from '../use-design-actions'
import { FIT, PART_DRAG_TYPE, PHONE_FIT, PinEventsContext, RoutesContext } from './context'
import { Focus as FocusIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FocusContext, focusClass, focusOf, netLevels } from './focus'
import { HighlightContext } from './highlight'
import { netsByPin, type PartNodeType, routeInput, turned, type WireEdgeType } from './model'
import { PartNode } from './part-node'
import { route } from './routing'
import { WireEdge } from './wire-edge'

const nodeTypes = { part: PartNode }
const edgeTypes = { wire: WireEdge }

type Props = {
  design: DesignDetail
  nodes: PartNodeType[]
  edges: WireEdgeType[]
  onNodesChange: OnNodesChange<PartNodeType>
  onEdgesChange: OnEdgesChange<WireEdgeType>
  actions: DesignActions
  readOnly: boolean
  /** Overlays on the canvas (the library button, an empty-design hint). */
  children?: ReactNode
}

export function DesignCanvas({
  design,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  actions,
  readOnly,
  children,
}: Props) {
  const store = useContext(HighlightContext)
  const { fitView, screenToFlowPosition } = useReactFlow()
  // Read-only is the phone view (docs/pages.md).
  const fit = readOnly ? PHONE_FIT : FIT

  // Fit once every card has been measured (the fitView prop fires too early, see pages.md).
  const initialized = useNodesInitialized()
  const fitted = useRef(false)
  useEffect(() => {
    if (!initialized || fitted.current) return
    // A frame later: the page switches to full width as it opens, after the first measure.
    const frame = requestAnimationFrame(() => {
      fitted.current = true
      void fitView(fit)
    })
    return () => cancelAnimationFrame(frame)
  }, [initialized, fitView, fit])

  // Nets come from the server with every answer; a change of wires clears the highlight.
  const nets = useMemo(() => netsByPin(design), [design])
  const netsRef = useRef(nets)
  useEffect(() => {
    netsRef.current = nets
    store.clear()
  }, [nets, store])
  const pinEvents = useMemo(
    () => ({
      hover: (key: string | null) =>
        store.hover(key ? (netsRef.current.get(key)?.pins ?? [key]) : []),
      tap: (key: string) => store.toggle(netsRef.current.get(key)?.pins ?? [key]),
    }),
    [store],
  )

  // Routes from the saved positions. A card being dragged isn't saved yet, so its wires
  // fall back to plain paths until it is dropped and saved.
  const { routes, junctions } = useMemo(() => {
    const { cards, wires } = routeInput(design)
    return route(cards, wires)
  }, [design])

  // Focus (focus.ts): the chosen parts and their wires; everything else greyed or faded.
  const [focusIds, setFocusIds] = useState<string[] | null>(null)
  const focus = useMemo(() => (focusIds ? focusOf(design, focusIds) : null), [design, focusIds])
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id)
  const focusSelection = useCallback(() => {
    if (selectedIds.length) setFocusIds(selectedIds)
  }, [selectedIds])
  const names = useMemo(
    () => new Map(design.placements.map((p) => [String(p.id), p.ref])),
    [design],
  )

  // Junction dots take their net's colour (its first wire's) and focus level.
  const junctionStyle = useMemo(() => {
    const color = new Map<string, string>()
    for (const wire of design.wires) {
      const net = nets.get(wire.a)?.name
      if (net && !color.has(net)) color.set(net, wire.color)
    }
    return { color, level: netLevels(focus, design, (key) => nets.get(key)?.name) }
  }, [design, nets, focus])

  const endOf = useCallback(
    (nodeId: string, handle: string | null | undefined) => {
      const placement = design.placements.find((p) => String(p.id) === nodeId)
      return `${placement?.ref}.${handle}`
    },
    [design],
  )

  // A wire from a pin to itself, or a second wire between the same two pins, is refused.
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const a = endOf(c.source, c.sourceHandle).toLowerCase()
      const b = endOf(c.target, c.targetHandle).toLowerCase()
      if (a === b) return false
      return !design.wires.some((w) => {
        const [wa, wb] = [w.a.toLowerCase(), w.b.toLowerCase()]
        return (wa === a && wb === b) || (wa === b && wb === a)
      })
    },
    [design, endOf],
  )

  const onConnect = useCallback(
    (c: Connection) =>
      quietly(
        actions.connect([
          { a: endOf(c.source, c.sourceHandle), b: endOf(c.target, c.targetHandle) },
        ]),
      ),
    [actions, endOf],
  )

  // Deleting goes through the server; the canvas redraws from its answer. Removing a part
  // removes its wires there too, so only wires not attached to a removed part are sent.
  const onBeforeDelete = useCallback(
    async ({ nodes: gone, edges: cut }: { nodes: PartNodeType[]; edges: WireEdgeType[] }) => {
      const removed = new Set(gone.map((n) => n.id))
      // One undo step for the whole selection.
      await actions
        .together(async (raw) => {
          for (const node of gone) await raw.removePlacement(Number(node.id))
          for (const edge of cut)
            if (!removed.has(edge.source) && !removed.has(edge.target))
              await raw.removeWire(Number(edge.id))
        })
        .catch(() => {})
      return false
    },
    [actions],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, __: PartNodeType, dragged: PartNodeType[]) => {
      const moves = dragged.flatMap((node) => {
        const placement = node.data.placement
        const x = Math.round(node.position.x / GRID) * GRID
        const y = Math.round(node.position.y / GRID) * GRID
        return x !== placement.x || y !== placement.y ? [{ id: placement.id, x, y }] : []
      })
      if (!moves.length) return
      // Moving a selection is one undo step.
      quietly(
        actions.together(async (raw) => {
          for (const { id, x, y } of moves) await raw.updatePlacement(id, { x, y })
        }),
      )
    },
    [actions],
  )

  // Keys: undo and redo, and R to rotate.
  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
        return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      // F focuses the selected parts (or ends focus); Esc ends it.
      if (key === 'escape' && focusIds) {
        setFocusIds(null)
        return
      }
      if (key === 'f' && !mod && !e.altKey) {
        if (focusIds) setFocusIds(null)
        else focusSelection()
        return
      }
      // Undo: Ctrl+Z. Redo: Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac).
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault()
        quietly(key === 'y' || e.shiftKey ? actions.redo() : actions.undo())
        return
      }
      if (key !== 'r' || mod || e.altKey) return
      // R turns the selected parts a quarter turn, as one undo step.
      const selected = nodes.filter((n) => n.selected)
      if (!selected.length) return
      quietly(
        actions.together(async (raw) => {
          for (const node of selected)
            await raw.updatePlacement(
              node.data.placement.id,
              turned(node.data.placement, node.data.part),
            )
        }),
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readOnly, nodes, actions, focusIds, focusSelection])

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(PART_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: DragEvent) => {
    const partId = Number(e.dataTransfer.getData(PART_DRAG_TYPE))
    if (!partId) return
    e.preventDefault()
    const at = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // Drop with the pointer near the card's top-left corner.
    quietly(
      actions.addParts([{ part_id: partId, x: Math.round(at.x - 20), y: Math.round(at.y - 20) }]),
    )
  }

  return (
    <PinEventsContext.Provider value={pinEvents}>
      <FocusContext.Provider value={focus}>
        <RoutesContext.Provider value={routes}>
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
            onBeforeDelete={onBeforeDelete}
            onNodeDragStop={onNodeDragStop}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={14}
            snapToGrid
            snapGrid={[GRID, GRID]}
            fitViewOptions={fit}
            minZoom={0.2}
            maxZoom={3}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            // Otherwise a tap on a pin starts a wire even when nodesConnectable is off.
            connectOnClick={!readOnly}
            edgesReconnectable={false}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            onEdgeMouseEnter={(_, e) => store.hover(nets.get(e.data!.wire.a)?.pins ?? [])}
            onEdgeMouseLeave={() => store.hover([])}
            onPaneClick={() => {
              store.clear()
              setFocusIds(null)
            }}
            // While focusing, Ctrl/Cmd-click adds a part to the focus or takes it out.
            onNodeClick={(e, node) => {
              if (!focusIds || !(e.ctrlKey || e.metaKey)) return
              setFocusIds((ids) =>
                ids?.includes(node.id)
                  ? ids.filter((id) => id !== node.id)
                  : [...(ids ?? []), node.id],
              )
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID * 2} size={1.2} />
            <Controls showInteractive={false} fitViewOptions={fit} />
            <MiniMap pannable zoomable className="!bg-card max-lg:!hidden" />
            <ViewportPortal>
              {junctions.map((j) => (
                <div
                  key={`${j.x},${j.y},${j.net}`}
                  className={cn('junction', focusClass(junctionStyle.level.get(j.net) ?? 'normal'))}
                  style={{
                    transform: `translate(${j.x}px, ${j.y}px) translate(-50%, -50%)`,
                    background: `var(--wire-${junctionStyle.color.get(j.net) ?? 'gray'})`,
                  }}
                />
              ))}
            </ViewportPortal>
            <Panel position="top-center">
              {focus ? (
                <div className="flex items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3 text-xs shadow-sm">
                  <FocusIcon className="size-3.5 text-primary" />
                  <span>
                    Focused on{' '}
                    <span className="font-mono">
                      {[...focus.nodes].map((id) => names.get(id)).join(', ')}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="rounded-full"
                    onClick={() => setFocusIds(null)}
                    title="Esc, or click the canvas"
                  >
                    <X />
                    Exit
                  </Button>
                </div>
              ) : selectedIds.length > 0 ? (
                <Button
                  variant="outline"
                  size="xs"
                  className="rounded-full bg-card shadow-sm"
                  onClick={focusSelection}
                  title="Show only these parts and their wires (F)"
                >
                  <FocusIcon />
                  Focus on{' '}
                  {selectedIds.length === 1
                    ? names.get(selectedIds[0])
                    : `${selectedIds.length} parts`}
                </Button>
              ) : null}
            </Panel>
            {children}
          </ReactFlow>
        </RoutesContext.Provider>
      </FocusContext.Provider>
    </PinEventsContext.Provider>
  )
}
