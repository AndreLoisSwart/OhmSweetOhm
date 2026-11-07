import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from '@/components/error-boundary'
import { DetailSkeleton } from '@/components/loading'
import { cn } from '@/lib/utils'
import { BottomBar } from './bottom-bar'
import { ConnectionBanner } from './connection-banner'
import { type PageWidth, PageWidthContext } from './page-width'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

// Desktop: sidebar. Mobile: top bar plus bottom bar.
export function AppShell() {
  const { pathname } = useLocation()
  const [width, setWidth] = useState<PageWidth>('reading')
  const full = width === 'full'
  return (
    <PageWidthContext.Provider value={setWidth}>
      <div className={cn('flex', full ? 'h-svh' : 'min-h-svh')}>
        <Sidebar compact={full} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <ConnectionBanner />
          <main
            className={cn(
              'mx-auto w-full flex-1',
              full
                ? // Edge to edge; on phones, clear of the bottom bar.
                  'flex min-h-0 flex-col pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0'
                : 'px-4 pt-6 pb-24 md:px-8 md:pb-8',
              // Wide pages still stop short of very wide screens, where columns would sprawl.
              width === 'wide' && 'max-w-[100rem]',
              width === 'reading' && 'max-w-5xl',
            )}
          >
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
    </PageWidthContext.Provider>
  )
}
