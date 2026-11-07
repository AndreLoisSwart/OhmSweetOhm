import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { NotFound } from '@/components/not-found'
import { DesignsPage } from '@/features/designs/designs-page'

// Designs loads with the app; other pages load when first opened, so the first visit
// downloads less (it matters on mobile data over the VPN).
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((module) => ({ default: module[name] })))

const PartsPage = page(() => import('@/features/parts/parts-page'), 'PartsPage')
const SettingsPage = page(() => import('@/features/settings/settings-page'), 'SettingsPage')
// Build step 2 canvas spike: full screen, not in the nav. Removed with the real canvas.
const SpikePage = page(() => import('@/features/spike/spike-page'), 'SpikePage')

export default function App() {
  return (
    <Routes>
      <Route
        path="spike"
        element={
          <Suspense>
            <SpikePage />
          </Suspense>
        }
      />
      <Route element={<AppShell />}>
        <Route index element={<DesignsPage />} />
        <Route path="parts" element={<PartsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
