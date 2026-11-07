import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { bottomNav } from './nav'

export function BottomBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {bottomNav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground',
              isActive && 'text-primary',
            )
          }
        >
          <item.icon className="size-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
