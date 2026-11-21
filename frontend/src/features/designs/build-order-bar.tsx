import { Eraser, Ghost, Hash, ListOrdered, SkipBack, SkipForward, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import type { BuildOrder } from './use-build-order'
import { quietly } from './use-design-actions'

/** At the top of the canvas while the build order view is open. */
export function BuildOrderBar({ build, readOnly }: { build: BuildOrder; readOnly: boolean }) {
  const pill =
    // w-max: React Flow's centred panel would otherwise shrink it to fit and wrap it.
    'flex h-12 w-max items-center gap-2 rounded-full border bg-card px-1.5 text-sm whitespace-nowrap shadow-sm'
  const icon = <ListOrdered className="ml-1.5 size-4.5 shrink-0 text-primary" />
  // Round music-player skip buttons, faded rather than removed at either end so
  // nothing moves.
  const skip = 'size-9 rounded-full bg-muted hover:bg-accent [&_svg]:size-5'
  // The bar sizes to the canvas (an @container on design-page.tsx): on a narrow one, the
  // parts list goes first, then button labels (icons stay), then the step label shortens.
  const label = '@max-xl:hidden'
  const exit = (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full"
      onClick={build.close}
      title="Esc or B"
      aria-label="Exit build order"
    >
      <X />
      <span className={label}>Exit</span>
    </Button>
  )
  const suggest = !readOnly && (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full"
      onClick={() => quietly(build.suggest())}
      title="Boards, then power, then each part with the passives that serve it"
      aria-label="Suggest an order"
    >
      <Sparkles />
      <span className={label}>Suggest</span>
    </Button>
  )

  if (build.numbering)
    return (
      <div className={pill}>
        {icon}
        <span>
          Click parts in order: next is <b>step {build.nextNumber}</b>
        </span>
        <span className="text-muted-foreground @max-3xl:hidden">
          · Shift-click joins the last step
        </span>
        {suggest}
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={() => quietly(build.clear())}
          title="Take every part out of the order"
          aria-label="Clear the order"
        >
          <Eraser />
          <span className={label}>Clear</span>
        </Button>
        <Button size="sm" className="rounded-full" onClick={build.stopNumbering}>
          Done
        </Button>
      </div>
    )

  if (!build.current)
    return (
      <div className={pill}>
        {icon}
        <span>No build order yet.</span>
        {!readOnly && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={build.startNumbering}>
            Number parts
          </Button>
        )}
        {suggest}
        {exit}
      </div>
    )

  const { current, index, steps } = build
  return (
    // Narrowest: two rows the width of the canvas, the skip controls on top.
    <div
      className={`${pill} @max-sm:h-auto @max-sm:w-[calc(100cqw-2rem)] @max-sm:flex-wrap @max-sm:justify-center @max-sm:rounded-3xl @max-sm:py-1.5`}
    >
      <span className="@max-sm:hidden">{icon}</span>
      <div className="flex items-center gap-2 @max-sm:basis-full @max-sm:justify-center">
        <Button
          variant="ghost"
          size="icon"
          className={skip}
          aria-label="Previous step"
          title="Previous step (←)"
          disabled={index === 0}
          onClick={build.prev}
        >
          <SkipBack />
        </Button>
        {/* Fixed widths, so the bar keeps its width and the skip buttons stay under the
          cursor from step to step. */}
        <span className="w-40 text-center font-medium tabular-nums @max-md:w-24">
          {current.value === null ? 'Not ordered' : `Step ${current.value}`}
          <span className="font-normal text-muted-foreground @max-md:hidden">
            {' '}
            · {index + 1} of {steps.length}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={skip}
          aria-label="Next step"
          title="Next step (→)"
          disabled={index === steps.length - 1}
          onClick={build.next}
        >
          <SkipForward />
        </Button>
      </div>
      <span
        className="w-40 truncate font-mono text-[13px] text-muted-foreground @max-3xl:hidden"
        title={current.refs.join(', ')}
      >
        {current.refs.join(', ')}
      </span>
      <Toggle
        className="rounded-full"
        pressed={build.ghost}
        onPressedChange={build.setGhost}
        aria-label="Ghost later steps"
        title="Ghost later steps instead of hiding them"
      >
        <Ghost />
      </Toggle>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={build.startNumbering}
          aria-label="Number parts"
          title="Number parts by clicking them in order"
        >
          <Hash />
          <span className={label}>Number parts</span>
        </Button>
      )}
      {exit}
    </div>
  )
}
