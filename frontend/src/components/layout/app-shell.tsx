import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from '@/components/error-boundary'
import { DetailSkeleton } from '@/components/loading'
import { BottomBar } from './bottom-bar'
import { ConnectionBanner } from './connection-banner'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

// Desktop: sidebar. Mobile: top bar plus bottom bar.
export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ConnectionBanner />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-8">
          {/* Keyed by path: a crash on one page clears when you move to another. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<DetailSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomBar />
    </div>
  )
}
