import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { toast } from 'sonner'
import { ApiError, errorMessage, isConnectionError } from '@/api/fetcher'
import { ErrorBoundary } from '@/components/error-boundary'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import './index.css'
import { BASE_PATH } from './lib/base-path'
import { isOnline, onConnectionChange, setOnline } from './lib/connection'

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network and server errors once; a 404 or 409 won't change on retry.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
    },
  },
  // Any answer from the app means it's reachable; a connection error means it isn't.
  queryCache: new QueryCache({
    onSuccess: () => setOnline(true),
    onError: (error) => isConnectionError(error) && setOnline(false),
  }),
  mutationCache: new MutationCache({
    // The data is small, so refetch everything after any change instead of
    // tracking which queries each change affects. Not awaited: TanStack Query would
    // wait for the refetch before running per-call callbacks, and by then the
    // component that made the call may be gone (e.g. a row that got removed).
    onSuccess: () => {
      setOnline(true)
      void queryClient.invalidateQueries()
    },
    onError: (error) => {
      if (isConnectionError(error)) {
        setOnline(false)
        toast.error("Can't reach Ohm Sweet Ohm, so that change wasn't saved")
      } else {
        toast.error(errorMessage(error))
      }
    },
  }),
})

// Back after a lost connection: refresh everything, since changes may have been missed.
onConnectionChange(() => {
  if (isOnline()) void queryClient.invalidateQueries()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASE_PATH || '/'}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
)
