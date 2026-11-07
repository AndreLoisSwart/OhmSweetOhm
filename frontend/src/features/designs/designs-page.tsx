import { Workflow } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export function DesignsPage() {
  return (
    <>
      <PageHeader title="Designs" />
      <EmptyState
        icon={Workflow}
        title="No designs yet"
        description="Wiring designs built from your parts will be listed here."
      />
    </>
  )
}
