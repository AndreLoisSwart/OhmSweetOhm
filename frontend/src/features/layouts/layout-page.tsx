import {
  ArrowLeft,
  Bot,
  CircuitBoard,
  FlipHorizontal2,
  History,
  Info,
  Library,
  Lock,
  MoreHorizontal,
  Printer,
  Redo2,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { errorMessage } from '@/api/fetcher'
import { useGetDesign } from '@/api/generated/designs/designs'
import { listLayoutRevisions, useDeleteLayout, useGetLayout } from '@/api/generated/layouts/layouts'
import type { DesignDetail, LayoutCheck, LayoutDetail } from '@/api/generated/model'
import { EmptyState } from '@/components/empty-state'
import { usePageWidth } from '@/components/layout/page-width'
import { DetailSkeleton } from '@/components/loading'
import { NotFound } from '@/components/not-found'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { quietly } from '@/features/designs/use-design-actions'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { BoardCanvas } from './board/board-canvas'
import { type BoardHighlight, NO_HIGHLIGHT } from './board/highlight'
import { type Cell, cellLabel, nextRotation, type Turn } from './board/geometry'
import {
  type ConnectorDraft,
  connectorStep,
  type CutTarget,
  inside,
  type Selection,
  takenHoles,
  type Tool,
} from './board/tools'
import { BoardToolbar } from './board-toolbar'
import { LayoutChecksBar } from './layout-checks-bar'
import { LayoutHistoryDialog } from './layout-history-dialog'
import { LayoutInspector } from './layout-inspector'
import { PartsTray } from './parts-tray'
import { type LayoutActions, useLayoutActions } from './use-layout-actions'
import { ViewSwitcher } from './view-switcher'

/** Notices changes this page didn't make (Claude, another tab), as the design page does. */
function useOutsideChanges(layout: LayoutDetail, actions: LayoutActions) {
  const seen = useRef(layout.updated_at)
  const [who, setWho] = useState<'claude' | 'elsewhere' | null>(null)
  useEffect(() => {
    if (layout.updated_at === seen.current) return
    seen.current = layout.updated_at
    if (actions.isOwn(layout.updated_at)) return
    actions.forgetUndo()
    void listLayoutRevisions(layout.id)
      .then((revisions) => setWho(revisions[0]?.author === 'claude' ? 'claude' : 'elsewhere'))
      .catch(() => setWho('elsewhere'))
  }, [layout.updated_at, layout.id, actions])
  return { who, dismiss: () => setWho(null) }
}

function LayoutEditor({ layout, design }: { layout: LayoutDetail; design: DesignDetail }) {
  const navigate = useNavigate()
  const actions = useLayoutActions(layout.id)
  const deleteLayout = useDeleteLayout()
  const readOnly = useMediaQuery(PHONE_QUERY)
  // The board needs room: side panels only on a large screen, overlays below that.
  const wide = useMediaQuery('(min-width: 1280px)')
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Selection>(() => {
    const id = Number(params.get('select'))
    return id ? { kind: 'part', id } : null
  })
  const [tool, setTool] = useState<Tool>('select')
  const [jumperStart, setJumperStart] = useState<Cell | null>(null)
  const [connector, setConnector] = useState<ConnectorDraft>({
    type: 'header_female',
    pinCount: 4,
    pins: [],
    rotation: 0,
  })
  // A part armed from the tray is put down turned this much (R while it's armed).
  const [armedRotation, setArmedRotation] = useState<Turn>(0)
  const [armed, setArmed] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [checksOpen, setChecksOpen] = useState(false)
  const [picked, setPicked] = useState<LayoutCheck | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [trayOpen, setTrayOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const changedBy = useOutsideChanges(layout, actions)

  // ?select= from "Show on board" selects that part once.
  useEffect(() => {
    if (params.has('select')) setParams({}, { replace: true })
  }, [params, setParams])

  const highlight: BoardHighlight = useMemo(
    () => (picked ? { pins: new Set(picked.pins), holes: new Set(picked.holes) } : NO_HIGHLIGHT),
    [picked],
  )

  const chooseTool = (next: Tool) => {
    if (next === 'cut' && layout.board_type !== 'stripboard') return
    setTool(next)
    setJumperStart(null)
    setArmed(null)
  }

  const taken = useMemo(() => takenHoles(layout), [layout])
  // Holes between the connector tool's pins on this board; null when they don't fit it.
  const connectorFits = connectorStep(connector.type, layout.pitch_mm)

  const cut = (target: CutTarget) => {
    const existing = layout.cuts.find(
      (c) => c.strip === target.strip && c.hole === target.hole && c.between === target.between,
    )
    if (existing) return quietly(actions.removeCut(existing.id))
    if (!inside(target, layout) || (target.between && target.hole >= layout.holes)) return
    const where = cellLabel(target)
    const who = taken.get(where)
    if (!target.between && who) {
      toast.error(`${who} is in ${where}: cutting there would leave it unconnected. Cut beside it`)
      return
    }
    quietly(actions.addCuts([target]))
  }

  const jumperPoint = (cell: Cell) => {
    if (!inside(cell, layout)) return
    const side = flipped ? 'bottom' : 'top'
    const who = taken.get(cellLabel(cell))
    if (side === 'top' && who) {
      toast.error(`${cellLabel(cell)} is taken by ${who}`)
      return
    }
    if (!jumperStart) return setJumperStart(cell)
    if (jumperStart.strip === cell.strip && jumperStart.hole === cell.hole)
      return setJumperStart(null)
    const a = jumperStart
    setJumperStart(null)
    // Not selected afterwards: on a tablet the Inspector would cover the board while
    // you go on to the next jumper. Click it to edit it.
    quietly(
      actions.addJumper({
        a_strip: a.strip,
        a_hole: a.hole,
        b_strip: cell.strip,
        b_hole: cell.hole,
        side,
      }),
    )
  }

  const placeConnector = (cell: Cell) => {
    if (!inside(cell, layout)) return
    if (!connectorFits) {
      toast.error(`Its pins don't fit this board's ${layout.pitch_mm} mm holes: pick another type`)
      return
    }
    quietly(
      actions
        .addConnector({
          type: connector.type,
          pin_count: Math.max(connector.pinCount, connector.pins.length),
          strip: cell.strip,
          hole: cell.hole,
          rotation: connector.rotation,
          pins: connector.pins,
        })
        .then((out) => {
          const added = out.connectors.at(-1)
          if (added) setSelected({ kind: 'connector', id: added.id })
          setTool('select')
          setConnector((c) => ({ ...c, pins: [] }))
        }),
    )
  }

  const place = (placementId: number, at: Cell) => {
    setArmed(null)
    setTrayOpen(false)
    setSelected({ kind: 'part', id: placementId })
    quietly(
      actions.place([
        { placement_id: placementId, strip: at.strip, hole: at.hole, rotation: armedRotation },
      ]),
    )
    setArmedRotation(0)
  }

  // Keys: V C J K pick a tool, R turns the selection, Delete removes it, F flips,
  // Esc steps back, Ctrl+Z undo.
  useEffect(() => {
    if (readOnly) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      )
        return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        quietly(event.shiftKey ? actions.redo() : actions.undo())
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        quietly(actions.redo())
        return
      }
      if (mod || event.altKey) return
      const key = event.key.toLowerCase()
      const tools: Record<string, Tool> = { v: 'select', c: 'cut', j: 'jumper', k: 'connector' }
      if (tools[key]) return chooseTool(tools[key])
      const part =
        selected?.kind === 'part'
          ? layout.parts.find((p) => p.placement_id === selected.id)
          : undefined
      const conn =
        selected?.kind === 'connector'
          ? layout.connectors.find((c) => c.id === selected.id)
          : undefined
      if (event.key === 'Escape') {
        if (jumperStart) setJumperStart(null)
        else if (tool !== 'select' || armed !== null) chooseTool('select')
        else {
          setSelected(null)
          setPicked(null)
        }
      } else if (key === 'r' && armed !== null) {
        setArmedRotation(nextRotation(armedRotation))
      } else if (key === 'r' && tool === 'connector') {
        setConnector((c) => ({ ...c, rotation: nextRotation(c.rotation) }))
      } else if (key === 'r' && part?.on_board) {
        quietly(
          actions.place([
            {
              placement_id: part.placement_id,
              strip: part.strip,
              hole: part.hole,
              rotation: nextRotation(part.rotation),
            },
          ]),
        )
      } else if (key === 'r' && conn) {
        quietly(actions.updateConnector(conn.id, { rotation: nextRotation(conn.rotation) }))
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selected) return
        setSelected(null)
        if (selected.kind === 'part') quietly(actions.unplace(selected.id))
        if (selected.kind === 'jumper') quietly(actions.removeJumper(selected.id))
        if (selected.kind === 'connector') quietly(actions.removeConnector(selected.id))
      } else if (key === 'f') {
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const inspector = (
    <LayoutInspector
      layout={layout}
      design={design}
      selected={selected}
      actions={actions}
      readOnly={readOnly}
      onDelete={() =>
        deleteLayout.mutate(
          { layoutId: layout.id },
          { onSuccess: () => navigate(`/designs/${design.id}`, { replace: true }) },
        )
      }
    />
  )
  const tray = (
    <PartsTray
      layout={layout}
      actions={actions}
      armed={armed}
      onArm={(id) => {
        setArmed(id)
        setArmedRotation(0)
      }}
      selected={selected?.kind === 'part' ? selected.id : null}
      onSelect={(id) => {
        setSelected({ kind: 'part', id })
        setTrayOpen(false)
      }}
      onAddConnector={(pins) => {
        setConnector((c) => ({ ...c, type: 'header_female', pinCount: pins.length, pins }))
        setTool('connector')
        setArmed(null)
        setTrayOpen(false)
      }}
      readOnly={readOnly}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to={`/designs/${design.id}`} aria-label="Back to the schematic">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="hidden min-w-0 truncate font-semibold sm:inline">{design.name}</span>
        <ViewSwitcher designId={design.id} current={layout.id} readOnly={readOnly} />
        <div className="flex-1" />
        {readOnly && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Read-only
          </span>
        )}
        <Button
          variant={flipped ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={flipped}
          title="Turn the board over (F): the copper side, mirrored"
          onClick={() => setFlipped((f) => !f)}
        >
          <FlipHorizontal2 />
          <span className="hidden sm:inline">{flipped ? 'Copper side' : 'Component side'}</span>
        </Button>
        {!readOnly && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!actions.canUndo}
              onClick={() => quietly(actions.undo())}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!actions.canRedo}
              onClick={() => quietly(actions.redo())}
            >
              <Redo2 />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
              <History />
              History
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/designs/${design.id}/layouts/${layout.id}/print`}>
                <Printer />
                Print build sheet
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!wide && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Layout details"
            aria-pressed={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <Info />
          </Button>
        )}
        <LayoutHistoryDialog
          layoutId={layout.id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          actions={actions}
          readOnly={readOnly}
        />
      </header>
      {changedBy.who && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-primary/10 px-3 py-1.5 text-sm">
          <Bot className="size-4 shrink-0" />
          <span className="flex-1">
            {changedBy.who === 'claude'
              ? 'Claude changed this layout.'
              : 'This layout was changed elsewhere.'}
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => setHistoryOpen(true)}
          >
            History
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={changedBy.dismiss}>
            <X />
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {wide && <aside className="flex w-64 shrink-0 flex-col border-r">{tray}</aside>}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <BoardCanvas
              layout={layout}
              design={design}
              flipped={flipped}
              tool={tool}
              selected={selected}
              onSelect={setSelected}
              highlight={highlight}
              armed={armed}
              onPlace={place}
              onMove={(part, at) =>
                quietly(
                  actions.place([
                    { placement_id: part.placement_id, strip: at.strip, hole: at.hole },
                  ]),
                )
              }
              onMoveConnector={(c, at) =>
                quietly(actions.updateConnector(c.id, { strip: at.strip, hole: at.hole }))
              }
              onCut={cut}
              jumperStart={jumperStart}
              onJumperPoint={jumperPoint}
              connectorPreview={
                tool === 'connector' && connectorFits
                  ? {
                      pins: Math.max(connector.pinCount, connector.pins.length),
                      step: connectorFits,
                      rotation: connector.rotation,
                    }
                  : null
              }
              onConnectorAt={placeConnector}
              armedRotation={armedRotation}
              readOnly={readOnly}
            />
            {!readOnly && (
              <BoardToolbar
                tool={tool}
                onTool={chooseTool}
                canCut={layout.board_type === 'stripboard'}
                flipped={flipped}
                jumperStarted={jumperStart !== null}
                connector={connector}
                onConnector={setConnector}
                pitch={layout.pitch_mm}
              />
            )}
            {!wide && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 left-2 z-10 bg-card"
                  onClick={() => setTrayOpen((open) => !open)}
                  aria-pressed={trayOpen}
                >
                  <Library />
                  Parts
                </Button>
                {trayOpen && (
                  <aside className="absolute top-12 bottom-2 left-2 z-10 flex w-64 flex-col rounded-lg border bg-card shadow-lg">
                    {tray}
                  </aside>
                )}
                {(detailsOpen || selected !== null) && (
                  <div className="absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-y-auto rounded-t-xl border-t bg-card p-4 pt-2 shadow-[0_-4px_16px_rgb(0_0_0/0.15)]">
                    <div className="mb-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                        onClick={() => {
                          setDetailsOpen(false)
                          setSelected(null)
                        }}
                      >
                        <X />
                      </Button>
                    </div>
                    {inspector}
                  </div>
                )}
              </>
            )}
          </div>
          <LayoutChecksBar
            layout={layout}
            open={checksOpen}
            onOpenChange={(open) => {
              if (open && !wide) {
                setDetailsOpen(false)
                setSelected(null)
              }
              setChecksOpen(open)
            }}
            picked={picked}
            onPick={(check) => {
              setPicked(check)
              if (!wide) setChecksOpen(false)
            }}
          />
        </div>
        {wide && <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">{inspector}</aside>}
      </div>
    </div>
  )
}

export function LayoutPage() {
  const params = useParams()
  const designId = Number(params.id)
  const layoutId = Number(params.layoutId)
  usePageWidth('full')
  const design = useGetDesign(designId, { query: { refetchInterval: 5000 } })
  const layout = useGetLayout(layoutId, { query: { refetchInterval: 5000 } })

  if (design.isPending || layout.isPending) return <DetailSkeleton />
  const error = design.error ?? layout.error
  if (error || !design.data || !layout.data) {
    if (!error || error.status === 404 || error.status === 422) return <NotFound />
    return (
      <EmptyState
        icon={CircuitBoard}
        title="Couldn't load this layout"
        description={errorMessage(error)}
      />
    )
  }
  if (layout.data.design_id !== designId) return <NotFound />
  return <LayoutEditor layout={layout.data} design={design.data} />
}
