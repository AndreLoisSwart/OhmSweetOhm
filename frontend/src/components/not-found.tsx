import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <EmptyState icon={SearchX} title="Page not found">
      <Button variant="outline" asChild>
        <Link to="/">Go home</Link>
      </Button>
    </EmptyState>
  )
}
