import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Rotation } from '@/features/parts/card/layout'
import { PartCard } from '@/features/parts/card/part-card'
import type { DraftPin } from './draft'

/** The card as it will look on the canvas, live while the pins are edited. */
export function PartPreview({ name, pins }: { name: string; pins: DraftPin[] }) {
  const [rotation, setRotation] = useState<Rotation>(0)
  return (
    <aside className="grid justify-items-start gap-2 lg:sticky lg:top-6">
      <div className="flex w-full items-center justify-between gap-4">
        <h3 className="text-xs font-medium text-muted-foreground">On the canvas</h3>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setRotation((r) => ((r + 90) % 360) as Rotation)}
          title="Rotate the preview, to check how the card reads turned"
        >
          <RotateCw />
          {rotation}°
        </Button>
      </div>
      {/* Scrolls sideways when a rotated board is wider than the screen. */}
      <div className="max-w-full overflow-x-auto rounded-lg bg-muted/40 p-6">
        <PartCard title={name} pins={pins} rotation={rotation} />
      </div>
    </aside>
  )
}
