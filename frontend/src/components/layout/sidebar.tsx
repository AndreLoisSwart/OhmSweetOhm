import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { Brand } from './brand'
import { settings, sidebarNav, type NavItem } from './nav'

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn('size-4', isActive && 'text-sidebar-primary')} />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col gap-6 border-r bg-sidebar p-3 md:flex">
      <div className="flex items-center gap-2 px-3 pt-2 font-semibold">
        <Brand />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {sidebarNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
      <SidebarLink item={settings} />
    </aside>
  )
}
