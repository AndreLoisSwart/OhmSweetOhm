import { PageHeader } from '@/components/page-header'
import { TagManager } from '@/features/tags/tag-manager'

// Claude (MCP) token and setup join in build step 7.
export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <TagManager />
    </>
  )
}
