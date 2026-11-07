import { Link } from 'react-router'
import { Brand } from './brand'

/** Mobile only: the sidebar carries the name on desktop. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:hidden">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <Brand />
      </Link>
    </header>
  )
}
