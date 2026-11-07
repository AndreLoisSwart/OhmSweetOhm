import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { NotFound } from '@/components/not-found'
import { DesignsPage } from '@/features/designs/designs-page'

// Designs loads with the app; other pages load when first opened, so the first visit
// downloads less (it matters on mobile data over the VPN).
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((module) => ({ default: module[name] })))

const PartsPage = page(() => import('@/features/parts/parts-page'), 'PartsPage')
const PartDetailPage = page(() => import('@/features/parts/part-detail-page'), 'PartDetailPage')
const DesignPage = page(() => import('@/features/designs/design-page'), 'DesignPage')
const SettingsPage = page(() => import('@/features/settings/settings-page'), 'SettingsPage')

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DesignsPage />} />
        <Route path="designs/:id" element={<DesignPage />} />
        <Route path="parts" element={<PartsPage />} />
        <Route path="parts/:id" element={<PartDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
