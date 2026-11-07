import { PageHeader } from '@/components/page-header'
import { TagManager } from '@/features/tags/tag-manager'
import { McpSetting } from './mcp-setting'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-12">
        <McpSetting />
        <TagManager />
      </div>
    </>
  )
}
