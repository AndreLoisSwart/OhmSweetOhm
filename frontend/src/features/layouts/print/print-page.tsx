import { ArrowLeft, Download, Printer, TriangleAlert } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { errorMessage } from '@/api/fetcher'
import { useGetBuildSheet, useGetLayout } from '@/api/generated/layouts/layouts'
import type { BuildSheetOut } from '@/api/generated/model'
import { DetailSkeleton } from '@/components/loading'
import { NotFound } from '@/components/not-found'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BoardPrint, MAX_NUMBERED_CUTS } from './board-print'

function download(name: string, svg: SVGSVGElement | null) {
  if (!svg) return
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`], {
    type: 'image/svg+xml',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-0.5 border-b border-black/30 text-[9pt] font-bold">{title}</h2>
      {children}
    </section>
  )
}

const Tick = () => (
  <span className="mr-1 inline-block size-[2.6mm] border border-black align-[-0.4mm]" />
)

/** A drawing with its list beside it (below it when the board is too wide). */
function Figure({
  title,
  board,
  children,
}: {
  title: string
  board: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mb-3 break-inside-avoid">
      <h2 className="mb-1 text-[10pt] font-bold">{title}</h2>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {board}
        <div className="min-w-[55mm] flex-1 space-y-2">{children}</div>
      </div>
    </section>
  )
}

/** One A4 sheet: on screen a white page, in print a page of its own. */
function Sheet({ children, next }: { children: ReactNode; next?: boolean }) {
  return (
    <article
      className={cn(
        'mx-auto my-4 box-border w-[210mm] bg-white p-[10mm] text-[8pt] leading-snug text-black shadow-lg print:m-0 print:w-auto print:p-0 print:shadow-none',
        next && 'print:break-before-page',
      )}
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {children}
    </article>
  )
}

function Jumpers({ jumpers, title }: { jumpers: BuildSheetOut['jumpers']; title: string }) {
  return (
    <Block title={`${title} (${jumpers.length})`}>
      <ul>
        {jumpers.map((j) => (
          <li key={j.jumper_id}>
            <Tick />
            <span
              className="mr-1 inline-block size-[2.2mm] rounded-full border border-black align-[-0.3mm]"
              style={{ background: j.color }}
            />
            <span className="font-mono">
              {j.number}. {j.a} → {j.b}
            </span>
            , {j.side === 'top' ? 'top' : j.insulated ? 'insulated' : 'bare'}, {j.color}, {j.holes}{' '}
            holes: cut {j.cut_mm} mm
          </li>
        ))}
      </ul>
    </Block>
  )
}

const ScaleBar = () => (
  <figure className="shrink-0">
    <div className="h-[2mm] w-[50mm] border-x-2 border-b-2 border-black" />
    <figcaption>50 mm: check it with a ruler</figcaption>
  </figure>
)

/**
 * The build sheet for printing (build step 19): first the copper side with its cuts (a
 * perfboard's traces) and their list, then, when there are any, the copper side with its
 * bottom jumpers; on a second page the component side with the parts, connectors and top
 * jumpers. All at true size, numbered to match the lists. Printed with the browser's own
 * print dialog, at "Actual size".
 */
export function PrintPage() {
  const params = useParams()
  const designId = Number(params.id)
  const layoutId = Number(params.layoutId)
  const layout = useGetLayout(layoutId)
  const sheet = useGetBuildSheet(layoutId)
  const cutsSvg = useRef<SVGSVGElement>(null)
  const jumpersSvg = useRef<SVGSVGElement>(null)
  const componentSvg = useRef<SVGSVGElement>(null)

  if (layout.isPending || sheet.isPending) return <DetailSkeleton />
  if (layout.error || sheet.error || !layout.data || !sheet.data) {
    const error = layout.error ?? sheet.error
    if (!error || error.status === 404) return <NotFound />
    return <p className="p-6 text-sm text-destructive">{errorMessage(error)}</p>
  }
  const l = layout.data
  const s = sheet.data
  const name = slug(`${s.title}`)
  const perfboard = l.board_type === 'perfboard'
  const bottom = s.jumpers.filter((j) => j.side === 'bottom')
  const top = s.jumpers.filter((j) => j.side === 'top')
  const links = perfboard ? 'bottom jumpers' : 'bottom links'

  return (
    <div className="min-h-svh bg-neutral-200 print:bg-white">
      {/* A4, 10 mm margins; colours as on screen (the jumper colours). */}
      <style>{`@page { size: A4; margin: 10mm } @media print { html, body { background: white } }`}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background p-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/designs/${designId}/layouts/${layoutId}`}>
            <ArrowLeft />
            Back to the board
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            download(`${name}-copper-${perfboard ? 'traces' : 'cuts'}.svg`, cutsSvg.current)
          }
        >
          <Download />
          {perfboard ? 'Traces SVG' : 'Cuts SVG'}
        </Button>
        {bottom.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => download(`${name}-copper-jumpers.svg`, jumpersSvg.current)}
          >
            <Download />
            Bottom jumpers SVG
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => download(`${name}-component.svg`, componentSvg.current)}
        >
          <Download />
          Component side SVG
        </Button>
        <span className="text-xs text-muted-foreground">
          Print at “Actual size” (100%), not “Fit to page”, then check the 50 mm bar with a ruler.
        </span>
      </div>

      <Sheet>
        <header className="mb-2 flex items-end justify-between gap-4 border-b-2 border-black pb-1">
          <div>
            <h1 className="text-[12pt] font-bold">{s.title}</h1>
            <span>{s.board}</span>
          </div>
          <ScaleBar />
        </header>

        {(s.errors > 0 || s.missing > 0) && (
          <div className="mb-2 flex gap-1.5 border-2 border-black p-1.5 font-bold">
            <TriangleAlert className="size-4 shrink-0" />
            <div>
              Not finished: {s.errors} error{s.errors === 1 ? '' : 's'}, {s.missing} connection
              {s.missing === 1 ? '' : 's'} still missing. Fix the layout before building.
              {s.warnings.length > 0 && (
                <ul className="mt-0.5 list-disc pl-4 font-normal">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="mb-2">
          <Block title="Order of work">
            <ol className="list-decimal columns-2 gap-[6mm] pl-4">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Block>
        </div>

        <Figure
          title={`1. Copper side, ${perfboard ? 'traces' : 'cuts'}: turned over, left and right swap`}
          board={<BoardPrint ref={cutsSvg} layout={l} sheet={s} view="cuts" />}
        >
          {perfboard ? (
            <Block title={`Traces (${s.traces.length})`}>
              {s.traces.length === 0 ? (
                <p>No traces on this board.</p>
              ) : (
                <ul>
                  {s.traces.map((t) => (
                    <li key={t.trace_id}>
                      <Tick />
                      <span className="font-mono">
                        T{t.number}. {t.a} → {t.b}
                      </span>
                      , {t.pads} pads, {t.kind}
                      {t.kind === 'tinned wire' ? ` (${t.mm} mm)` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          ) : (
            <Block title={`Cuts (${s.cuts.length}), strip by strip`}>
              {s.cuts.length === 0 ? (
                <p>No cuts on this board.</p>
              ) : (
                <>
                  <ul className="columns-3 gap-2">
                    {s.cuts.map((c) => (
                      <li key={c.cut_id} className="font-mono">
                        <Tick />
                        {c.number}. {c.at}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[7pt]">
                    {s.cuts.length > MAX_NUMBERED_CUTS
                      ? 'Too many to number on the drawing: find each by its strip letter and hole number. '
                      : ''}
                    {s.cuts.some((c) => c.between)
                      ? 'C9-10: a knife cut between the two holes.'
                      : ''}
                  </p>
                </>
              )}
            </Block>
          )}
        </Figure>

        {bottom.length > 0 && (
          <Figure
            title={`2. Copper side, ${links}, and every joint to solder (rings)`}
            board={<BoardPrint ref={jumpersSvg} layout={l} sheet={s} view="jumpers" />}
          >
            <Jumpers jumpers={bottom} title={links[0].toUpperCase() + links.slice(1)} />
            <p className="text-[7pt]">Dashed: bare wire. Red: a supply rail, black: ground.</p>
          </Figure>
        )}
      </Sheet>

      <Sheet next>
        <header className="mb-2 flex items-baseline justify-between gap-4 border-b-2 border-black pb-1">
          <h1 className="text-[12pt] font-bold">{s.title}</h1>
          <span className="shrink-0">{s.board}</span>
        </header>

        <Figure
          title={`${bottom.length > 0 ? 3 : 2}. Component side`}
          board={<BoardPrint ref={componentSvg} layout={l} sheet={s} view="component" />}
        >
          {top.length > 0 && <Jumpers jumpers={top} title="Top jumpers" />}
          <p className="text-[7pt]">
            Connector pins: − ground, + a supply. Pin 1 filled, a part's pin 1 square.
          </p>
        </Figure>

        <div className="columns-2 gap-[6mm] [&>section]:mb-2">
          <Block title="Parts">
            <ul>
              {s.parts.map((p) => (
                <li key={p.ref}>
                  <Tick />
                  {p.step != null && <span className="font-semibold">Step {p.step}: </span>}
                  <span className="font-mono font-bold">{p.ref}</span> {p.part}:{' '}
                  {p.on_board
                    ? `pin 1 at ${p.at}, turned ${p.rotation}°, ${p.mount}`
                    : 'off the board, on a cable'}
                </li>
              ))}
            </ul>
          </Block>
          {s.connectors.length > 0 && (
            <Block title="Connectors and cables">
              <ul>
                {s.connectors.map((c) => (
                  <li key={c.ref}>
                    <Tick />
                    <span className="font-mono font-bold">{c.ref}</span> {c.pin_count}-pin {c.type}
                    {c.at ? `, pin 1 at ${c.at}` : ''} → {c.serves.join(', ') || 'nothing'}:{' '}
                    <span className="font-mono">
                      {c.pins.map((pin, i) => `${i + 1} ${pin ?? '—'}`).join(', ')}
                    </span>{' '}
                    ({c.straight ? 'straight cable' : 'crossed: check the order'})
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title="To have ready">
            <ul className="list-disc pl-4">
              {s.shopping.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Block>
        </div>
      </Sheet>
    </div>
  )
}
