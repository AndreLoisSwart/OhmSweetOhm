import { ReactFlowProvider, useEdgesState, useNodesState } from '@xyflow/react'
import { ArrowLeft, Info, Library, Lock, Workflow, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { errorMessage } from '@/api/fetcher'
import { useDeleteDesign, useGetDesign } from '@/api/generated/designs/designs'
import type { DesignDetail } from '@/api/generated/model'
import { EditableText } from '@/components/editable-text'
import { EmptyState } from '@/components/empty-state'
import { usePageWidth } from '@/components/layout/page-width'
import { DetailSkeleton } from '@/components/loading'
import { NotFound } from '@/components/not-found'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/format'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { DesignCanvas } from './canvas/design-canvas'
import { HighlightContext, HighlightStore, usePinnedNet } from './canvas/highlight'
import { buildEdges, buildNodes, type PartNodeType, type WireEdgeType } from './canvas/model'
import { Inspector } from './inspector'
import { LibraryPanel } from './library-panel'
import { quietly, useDesignActions } from './use-design-actions'

function DesignEditor({ design }: { design: DesignDetail }) {
  const navigate = useNavigate()
  const actions = useDesignActions(design.id)
  const deleteDesign = useDeleteDesign()
  const [store] = useState(() => new HighlightStore())
  const readOnly = useMediaQuery(PHONE_QUERY)
  const wide = useMediaQuery('(min-width: 1024px)')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // React Flow keeps its own copy (positions while dragging, selection); it is rebuilt
  // from every answer the server gives.
  const [nodes, setNodes, onNodesChange] = useNodesState<PartNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<WireEdgeType>([])
  useEffect(() => {
    setNodes((previous) => buildNodes(design, previous))
    setEdges((previous) => buildEdges(design, previous))
  }, [design, setNodes, setEdges])

  const selectedNode = nodes.find((n) => n.selected)
  const placement = design.placements.find((p) => String(p.id) === selectedNode?.id)
  const selectedEdge = edges.find((e) => e.selected)
  const wire = design.wires.find((w) => String(w.id) === selectedEdge?.id)

  const inspector = (
    <Inspector
      design={design}
      placement={placement}
      wire={wire}
      actions={actions}
      readOnly={readOnly}
      onDeleteDesign={() =>
        deleteDesign.mutate(
          { designId: design.id },
          { onSuccess: () => navigate('/', { replace: true }) },
        )
      }
    />
  )

  return (
    <HighlightContext.Provider value={store}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/" aria-label="All designs">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            {readOnly ? (
              <h1 className="truncate font-semibold">{design.name}</h1>
            ) : (
              <EditableText
                value={design.name}
                onSave={(name) => quietly(actions.updateDesign({ name }))}
                aria-label="Design name"
                className="font-semibold"
              />
            )}
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {plural(design.part_count, 'part')}
          </span>
          {readOnly && (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title="Designs are read-only on a phone"
            >
              <Lock className="size-3.5" />
              Read-only
            </span>
          )}
          {!wide && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Design details"
              aria-pressed={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <Info />
            </Button>
          )}
        </header>
        <div className="flex min-h-0 flex-1">
          {wide && !readOnly && (
            <aside className="w-60 shrink-0 border-r">
              <LibraryPanel design={design} actions={actions} />
            </aside>
          )}
          <div className="relative min-w-0 flex-1">
            <DesignCanvas
              design={design}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              actions={actions}
              readOnly={readOnly}
            />
            {design.placements.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <EmptyState
                  icon={Workflow}
                  title="An empty design"
                  description={
                    readOnly
                      ? 'Parts are placed on a tablet or computer.'
                      : wide
                        ? 'Drag parts from the library, then wire pin to pin.'
                        : 'Add parts from the library, then wire pin to pin.'
                  }
                />
              </div>
            )}
            {!wide && !readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 left-2 z-10 bg-card"
                  onClick={() => setLibraryOpen((open) => !open)}
                  aria-pressed={libraryOpen}
                >
                  <Library />
                  Parts
                </Button>
                {libraryOpen && (
                  <aside className="absolute top-12 bottom-2 left-2 z-10 w-64 rounded-lg border bg-card shadow-lg">
                    <LibraryPanel
                      design={design}
                      actions={actions}
                      onAdded={() => setLibraryOpen(false)}
                    />
                  </aside>
                )}
              </>
            )}
            {!wide && (
              <BottomSheet
                open={Boolean(placement || wire || detailsOpen)}
                onClose={() => {
                  setDetailsOpen(false)
                  setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
                  setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)))
                  store.clear()
                }}
              >
                {inspector}
              </BottomSheet>
            )}
          </div>
          {wide && (
            <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">{inspector}</aside>
          )}
        </div>
      </div>
    </HighlightContext.Provider>
  )
}

/** Below the canvas on tablets and phones: the inspector, when there is something to show. */
function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  // A highlighted net (a tapped pin) opens it too, to show what's on the net.
  const net = usePinnedNet()
  if (!open && net.length === 0) return null
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-y-auto rounded-t-xl border-t bg-card p-4 pt-2 shadow-[0_-4px_16px_rgb(0_0_0/0.15)]">
      <div className="mb-1 flex justify-end">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      {children}
    </div>
  )
}

export function DesignPage() {
  const designId = Number(useParams().id)
  usePageWidth('full')
  const { data: design, error, isPending } = useGetDesign(designId)

  if (isPending) return <DetailSkeleton />
  if (error) {
    if (error.status === 404 || error.status === 422) return <NotFound />
    return (
      <EmptyState
        icon={Workflow}
        title="Couldn't load this design"
        description={errorMessage(error)}
      />
    )
  }
  return (
    <ReactFlowProvider>
      <DesignEditor design={design} />
    </ReactFlowProvider>
  )
}
