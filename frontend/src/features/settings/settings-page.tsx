import { Settings } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState
        icon={Settings}
        title="Nothing to set yet"
        description="Claude (MCP) access and tags will be managed here."
      />
    </>
  )
}
