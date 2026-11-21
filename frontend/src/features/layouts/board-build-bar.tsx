import { Ghost, ListOrdered, SkipBack, SkipForward, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import type { BoardBuild } from './use-board-build'

/**
 * Over the board while stepping through the build order: the schematic's bar
 * (designs/build-order-bar.tsx) without numbering, which stays on the schematic.
 */
export function BoardBuildBar({ build, designId }: { build: BoardBuild; designId: number }) {
  const pill =
    'pointer-events-auto flex h-12 w-max max-w-full items-center gap-2 rounded-full border bg-card px-1.5 text-sm whitespace-nowrap shadow-sm'
  const icon = <ListOrdered className="ml-1.5 size-4.5 shrink-0 text-primary" />
  const skip = 'size-9 rounded-full bg-muted hover:bg-accent [&_svg]:size-5'
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
      <span className="@max-xl:hidden">Exit</span>
    </Button>
  )

  if (!build.current)
    return (
      <div className={pill}>
        {icon}
        <span>No build order yet.</span>
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to={`/designs/${designId}`}>Number parts on the schematic</Link>
        </Button>
        {exit}
      </div>
    )

  const { current, index, steps } = build
  return (
    <div
      className={`${pill} @max-sm:h-auto @max-sm:w-[calc(100cqw-1rem)] @max-sm:flex-wrap @max-sm:justify-center @max-sm:rounded-3xl @max-sm:py-1.5`}
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
        {/* Fixed widths, so the skip buttons stay under the cursor from step to step. */}
        <span className="w-44 text-center font-medium tabular-nums @max-md:w-28">
          {current.label}
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
      {exit}
    </div>
  )
}
