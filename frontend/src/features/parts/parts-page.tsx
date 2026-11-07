import { Cpu } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export function PartsPage() {
  return (
    <>
      <PageHeader title="Parts" />
      <EmptyState
        icon={Cpu}
        title="No parts yet"
        description="The modules you build with, and their pins, will be listed here."
      />
    </>
  )
}
