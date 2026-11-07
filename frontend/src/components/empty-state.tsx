import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = { icon: LucideIcon; title: string; description?: string; children?: ReactNode }

export function EmptyState({ icon: Icon, title, description, children }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
