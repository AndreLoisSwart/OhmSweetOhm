import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

// A page loaded on demand couldn't be fetched: the app was updated (its old files are
// gone) or can't be reached right now.
const isLoadFailure = (error: Error) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    error.message,
  )

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Catches a crash while drawing, so one broken page doesn't blank the whole app.
 * Give it a key (e.g. the path) to reset it on navigation. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const loadFailure = isLoadFailure(error)
    return (
      <EmptyState
        icon={TriangleAlert}
        title={loadFailure ? "Couldn't load this page" : 'Something went wrong on this page'}
        description={
          loadFailure
            ? "Ohm Sweet Ohm may have just been updated, or can't be reached right now. Reload to try again."
            : 'Reloading usually fixes it. ' + error.message
        }
      >
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          {!loadFailure && (
            // A full load of the app's root, which also clears this error.
            <Button variant="outline" onClick={() => window.location.assign(document.baseURI)}>
              Go home
            </Button>
          )}
        </div>
      </EmptyState>
    )
  }
}
