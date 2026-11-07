import { CloudOff } from 'lucide-react'
import { errorMessage } from '@/api/fetcher'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

type Props = { what: string; error: unknown; onRetry: () => void }

/** In place of a list that failed to load, so it isn't mistaken for an empty one. */
export function LoadError({ what, error, onRetry }: Props) {
  return (
    <EmptyState icon={CloudOff} title={`Couldn't load ${what}`} description={errorMessage(error)}>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </EmptyState>
  )
}
