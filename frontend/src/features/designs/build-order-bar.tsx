import { ChevronLeft, ChevronRight, Eraser, Ghost, ListOrdered, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import type { BuildOrder } from './use-build-order'
import { quietly } from './use-design-actions'

/** At the top of the canvas while the build order view is open. */
export function BuildOrderBar({ build, readOnly }: { build: BuildOrder; readOnly: boolean }) {
  const pill =
    // w-max: React Flow's centred panel would otherwise shrink it to fit and wrap it.
    'flex w-max items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-xs whitespace-nowrap shadow-sm'
  const exit = (
    <Button
      variant="ghost"
      size="xs"
      className="rounded-full"
      onClick={build.close}
      title="Esc or B"
    >
      <X />
      Exit
    </Button>
  )
  const suggest = !readOnly && (
    <Button
      variant="ghost"
      size="xs"
      className="rounded-full"
      onClick={() => quietly(build.suggest())}
      title="Boards, then power, then each part with the passives that serve it"
    >
      <Sparkles />
      Suggest
    </Button>
  )

  if (build.numbering)
    return (
      <div className={pill}>
        <ListOrdered className="size-3.5 text-primary" />
        <span>
          Click parts in order: next is <b>step {build.nextNumber}</b>
        </span>
        <span className="text-muted-foreground max-md:hidden">
          · Shift-click joins the last step
        </span>
        {suggest}
        <Button
          variant="ghost"
          size="xs"
          className="rounded-full"
          onClick={() => quietly(build.clear())}
          title="Take every part out of the order"
        >
          <Eraser />
          Clear
        </Button>
        <Button size="xs" className="rounded-full" onClick={build.stopNumbering}>
          Done
        </Button>
      </div>
    )

  if (!build.current)
    return (
      <div className={pill}>
        <ListOrdered className="size-3.5 text-primary" />
        <span>No build order yet.</span>
        {!readOnly && (
          <Button variant="ghost" size="xs" className="rounded-full" onClick={build.startNumbering}>
            Number parts
          </Button>
        )}
        {suggest}
        {exit}
      </div>
    )

  const { current, index, steps } = build
  return (
    <div className={pill}>
      <ListOrdered className="size-3.5 text-primary" />
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-full"
        aria-label="Previous step"
        title="Previous step (←)"
        disabled={index === 0}
        onClick={build.prev}
      >
        <ChevronLeft />
      </Button>
      <span className="font-medium tabular-nums">
        {current.value === null ? 'Not ordered' : `Step ${current.value}`}
        <span className="font-normal text-muted-foreground">
          {' '}
          · {index + 1} of {steps.length}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-full"
        aria-label="Next step"
        title="Next step (→)"
        disabled={index === steps.length - 1}
        onClick={build.next}
      >
        <ChevronRight />
      </Button>
      <span className="max-w-48 truncate font-mono" title={current.refs.join(', ')}>
        {current.refs.join(', ')}
      </span>
      <Toggle
        size="sm"
        className="rounded-full"
        pressed={build.ghost}
        onPressedChange={build.setGhost}
        aria-label="Ghost later steps"
        title="Ghost later steps instead of hiding them"
      >
        <Ghost />
      </Toggle>
      {!readOnly && (
        <Button variant="ghost" size="xs" className="rounded-full" onClick={build.startNumbering}>
          Number parts
        </Button>
      )}
      {exit}
    </div>
  )
}
