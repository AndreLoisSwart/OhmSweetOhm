import { cn } from 'cn'
import type { ComponentProps } from 'react'

/** A plain <select> styled like Input. Native, so it works well with touch and keyboards. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&>option]:bg-popover',
        className,
      )}
      {...props}
    />
  )
}
