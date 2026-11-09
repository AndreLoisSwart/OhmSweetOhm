import { ArrowLeft, Download, Printer, TriangleAlert } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { errorMessage } from '@/api/fetcher'
import { useGetBuildSheet, useGetLayout } from '@/api/generated/layouts/layouts'
import { DetailSkeleton } from '@/components/loading'
import { NotFound } from '@/components/not-found'
import { Button } from '@/components/ui/button'
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

/**
 * The build sheet for printing on one A4 page (build step 19): both sides of the board
 * at true size, numbered to match the cut and jumper lists, and the parts, connectors,
 * what to have ready and the order of work. Printed with the browser's own print
 * dialog, at "Actual size".
 */
export function PrintPage() {
  const params = useParams()
  const designId = Number(params.id)
  const layoutId = Number(params.layoutId)
  const layout = useGetLayout(layoutId)
  const sheet = useGetBuildSheet(layoutId)
  const component = useRef<SVGSVGElement>(null)
  const copper = useRef<SVGSVGElement>(null)

  if (layout.isPending || sheet.isPending) return <DetailSkeleton />
  if (layout.error || sheet.error || !layout.data || !sheet.data) {
    const error = layout.error ?? sheet.error
    if (!error || error.status === 404) return <NotFound />
    return <p className="p-6 text-sm text-destructive">{errorMessage(error)}</p>
  }
  const l = layout.data
  const s = sheet.data
  const name = slug(`${s.title}`)

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
          onClick={() => download(`${name}-component.svg`, component.current)}
        >
          <Download />
          Component side SVG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => download(`${name}-copper.svg`, copper.current)}
        >
          <Download />
          Copper side SVG
        </Button>
        <span className="text-xs text-muted-foreground">
          Print at “Actual size” (100%), not “Fit to page”, then check the 50 mm bar with a ruler.
        </span>
      </div>

      <article
        className="mx-auto my-4 box-border w-[210mm] bg-white p-[10mm] text-[8pt] leading-snug text-black shadow-lg print:m-0 print:w-auto print:p-0 print:shadow-none"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <header className="mb-2 flex items-baseline justify-between gap-4 border-b-2 border-black pb-1">
          <h1 className="text-[12pt] font-bold">{s.title}</h1>
          <span className="shrink-0">{s.board}</span>
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

        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <figure>
            <figcaption className="font-bold">Component side</figcaption>
            <BoardPrint ref={component} layout={l} sheet={s} side="component" />
          </figure>
          <figure>
            <figcaption className="font-bold">
              Copper side, turned over: left and right swap. Cut along it, or tape it on.
            </figcaption>
            <BoardPrint ref={copper} layout={l} sheet={s} side="copper" />
          </figure>
          <figure className="self-end">
            <div className="h-[2mm] w-[50mm] border-x-2 border-b-2 border-black" />
            <figcaption>50 mm: check it with a ruler</figcaption>
          </figure>
        </div>

        <div className="mt-2 columns-2 gap-[6mm] [&>section]:mb-2">
          <Block title="Order of work">
            <ol className="list-decimal pl-4">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Block>
          {s.cuts.length > 0 && (
            <Block title={`Cuts (${s.cuts.length}), copper side, strip by strip`}>
              <ul className="columns-4 gap-2">
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
                {s.cuts.some((c) => c.between) ? 'C9-10: a knife cut between the two holes.' : ''}
              </p>
            </Block>
          )}
          {s.jumpers.length > 0 && (
            <Block title={`Jumpers (${s.jumpers.length})`}>
              <ul>
                {s.jumpers.map((j) => (
                  <li key={j.jumper_id}>
                    <Tick />
                    <span className="font-mono">
                      {j.number}. {j.a} → {j.b}
                    </span>
                    ,{' '}
                    {j.side === 'top' ? 'top' : j.insulated ? 'bottom, insulated' : 'bottom, bare'},{' '}
                    {j.color}, {j.holes} holes: cut {j.cut_mm} mm
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title="Parts">
            <ul>
              {s.parts.map((p) => (
                <li key={p.ref}>
                  <Tick />
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
      </article>
    </div>
  )
}
