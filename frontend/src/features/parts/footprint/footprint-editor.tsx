import { useQueryClient } from '@tanstack/react-query'
import { Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/fetcher'
import type { PartDetail } from '@/api/generated/model'
import {
  footprintFromSides,
  getGetPartQueryKey,
  useSetFootprint,
} from '@/api/generated/parts/parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { pinColor } from '@/features/parts/card/pin-style'
import { cn } from '@/lib/utils'
import {
  type FootprintDraft,
  fromPart,
  onGrid,
  PITCH_MM,
  type Parsed,
  parse,
  toFootprintIn,
  withGenerated,
} from './draft'

/** px per mm in the preview, before it's scaled to fit. */
const PX = 10

function MmInput({
  value,
  onChange,
  label,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  invalid?: boolean
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder="—"
      className="h-7 w-20 px-2 font-mono text-xs"
    />
  )
}

/** The footprint drawn on a 2.54 mm grid of holes, top view. */
function FootprintPreview({ part, parsed }: { part: PartDetail; parsed: Parsed }) {
  const kinds = new Map(part.pins.map((p) => [p.id, p.kind]))
  const { holes, body } = parsed
  if (!holes.length && !body)
    return (
      <div className="grid h-40 w-full place-items-center rounded-lg border border-dashed text-sm text-muted-foreground lg:w-80">
        No footprint yet
      </div>
    )
  const xs = [...holes.map((h) => h.x), ...(body ? [body.x, body.x + body.w] : [])]
  const ys = [...holes.map((h) => h.y), ...(body ? [body.y, body.y + body.h] : [])]
  const pad = PITCH_MM
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const w = Math.max(...xs) + pad - minX
  const h = Math.max(...ys) + pad - minY
  const origin = holes[0] ?? { x: 0, y: 0 }
  // The protoboard's holes, lined up with the first pin.
  const grid: [number, number][] = []
  const startX = origin.x + Math.ceil((minX - origin.x) / PITCH_MM) * PITCH_MM
  const startY = origin.y + Math.ceil((minY - origin.y) / PITCH_MM) * PITCH_MM
  for (let x = startX; x <= minX + w; x += PITCH_MM)
    for (let y = startY; y <= minY + h; y += PITCH_MM) grid.push([x, y])
  const offGrid = holes.filter((hole) => !onGrid(hole.x, hole.y, origin))

  return (
    <figure className="grid gap-2">
      <svg
        viewBox={`${minX * PX} ${minY * PX} ${w * PX} ${h * PX}`}
        className="max-h-[28rem] w-full rounded-lg border bg-muted/30 lg:w-80"
        role="img"
        aria-label={`Footprint of ${part.name}`}
      >
        {grid.map(([x, y]) => (
          <circle
            key={`${x},${y}`}
            cx={x * PX}
            cy={y * PX}
            r={0.5 * PX}
            className="fill-muted-foreground/15"
          />
        ))}
        {body && (
          <rect
            x={body.x * PX}
            y={body.y * PX}
            width={body.w * PX}
            height={body.h * PX}
            rx={0.6 * PX}
            className="fill-foreground/5 stroke-foreground/50"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        )}
        {holes.map((hole) => {
          const off = !onGrid(hole.x, hole.y, origin)
          return (
            <g key={hole.pinId}>
              <circle
                cx={hole.x * PX}
                cy={hole.y * PX}
                r={0.8 * PX}
                fill={off ? 'var(--color-amber-500, #f59e0b)' : pinColor(kinds.get(hole.pinId)!)}
                className="stroke-background"
                strokeWidth={2}
              />
              <text
                x={hole.x * PX + 1.1 * PX}
                y={hole.y * PX + 0.35 * PX}
                fontSize={0.95 * PX}
                className="fill-foreground font-mono"
              >
                {hole.name}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground lg:w-80">
        Top view, on a {PITCH_MM} mm grid lined up with the first pin.{' '}
        {offGrid.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            Off the grid: {offGrid.map((h) => h.name).join(', ')}. It won&apos;t sit on a protoboard
            as it is.
          </span>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * Where each pin goes through a board, and the outline the part covers, in mm from its
 * origin (build step 14). Generated from the pins' sides for header modules, then
 * adjusted by hand; saved together. The page keys it on the pins, so a changed pin list
 * starts a fresh draft.
 */
export function FootprintEditor({ part }: { part: PartDetail }) {
  const saved = useMemo(() => fromPart(part.pins, part.body_mm), [part.pins, part.body_mm])
  const [draft, setDraft] = useState<FootprintDraft>(saved)
  const [span, setSpan] = useState('')
  const [pitch, setPitch] = useState(String(PITCH_MM))
  const [generating, setGenerating] = useState(false)
  const queryClient = useQueryClient()
  const setFootprint = useSetFootprint({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetPartQueryKey(part.id), result)
        setDraft(fromPart(result.pins, result.body_mm))
      },
    },
  })
  const parsed = useMemo(() => parse(draft), [draft])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const generate = async () => {
    const spanMm = Number(span.replace(',', '.'))
    const pitchMm = Number(pitch.replace(',', '.'))
    setGenerating(true)
    try {
      const made = await footprintFromSides(part.id, {
        ...(span.trim() && { span_mm: spanMm }),
        pitch_mm: pitchMm || PITCH_MM,
      })
      setDraft((current) => withGenerated(current, made))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  const setHole = (pinId: number, change: { x?: string; y?: string }) =>
    setDraft((d) => ({
      ...d,
      holes: d.holes.map((h) => (h.pinId === pinId ? { ...h, ...change } : h)),
    }))
  const setBody = (change: Partial<FootprintDraft['body']>) =>
    setDraft((d) => ({ ...d, body: { ...d.body, ...change } }))

  if (!part.pins.length) return <p className="text-sm text-muted-foreground">Add the pins first.</p>

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Rows apart (mm)
            <Input
              value={span}
              onChange={(e) => setSpan(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 15.24"
              className="h-8 w-28 font-mono text-xs"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Pitch (mm)
            <Input
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              inputMode="decimal"
              className="h-8 w-20 font-mono text-xs"
            />
          </label>
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            <Wand2 />
            Generate from sides
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Left and right pins become two rows of holes that far apart (top and bottom likewise),
            the first left pin at 0, 0. An outline already entered is kept. Only the draft changes
            until you save.
          </p>
        </div>

        <div className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Outline (mm)</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1 font-mono">
                {key}
                <MmInput
                  value={draft.body[key]}
                  onChange={(value) => setBody({ [key]: value })}
                  label={`Outline ${key}`}
                  invalid={parsed.errors.has('body')}
                />
              </label>
            ))}
          </div>
          {parsed.errors.get('body') && (
            <p className="text-xs text-destructive">{parsed.errors.get('body')}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Holes (mm)</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {draft.holes.map((hole) => {
              const error = parsed.errors.get(hole.pinId)
              return (
                <li key={hole.pinId} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="w-20 truncate font-mono" title={hole.name}>
                    {hole.name}
                  </span>
                  <MmInput
                    value={hole.x}
                    onChange={(x) => setHole(hole.pinId, { x })}
                    label={`${hole.name} x`}
                    invalid={!!error}
                  />
                  <MmInput
                    value={hole.y}
                    onChange={(y) => setHole(hole.pinId, { y })}
                    label={`${hole.name} y`}
                    invalid={!!error}
                  />
                  {error && <span className="basis-full text-destructive">{error}</span>}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2">
          <Button
            onClick={() => setFootprint.mutate({ partId: part.id, data: toFootprintIn(parsed) })}
            disabled={!dirty || parsed.errors.size > 0 || setFootprint.isPending}
          >
            Save footprint
          </Button>
          <Button variant="ghost" onClick={() => setDraft(saved)} disabled={!dirty}>
            Discard changes
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setDraft((d) => ({
                holes: d.holes.map((h) => ({ ...h, x: '', y: '' })),
                body: { x: '', y: '', w: '', h: '' },
              }))
            }
          >
            Clear
          </Button>
          <span
            className={cn(
              'ml-auto text-xs',
              parsed.errors.size ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {parsed.errors.size > 0
              ? 'Fix the values marked in red'
              : dirty
                ? 'Unsaved changes'
                : `${parsed.holes.length} of ${part.pins.length} pins have a hole`}
          </span>
        </div>
      </div>
      <FootprintPreview part={part} parsed={parsed} />
    </div>
  )
}
