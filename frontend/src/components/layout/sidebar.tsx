import { HousePlug, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { Brand } from './brand'
import { settings, sidebarNav, type NavItem } from './nav'

const COLLAPSED_KEY = 'ohm.sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          collapsed ? 'justify-center px-0' : 'px-3',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon className={cn('size-4 shrink-0', isActive && 'text-sidebar-primary')} />
          {!collapsed && item.label}
        </>
      )}
    </NavLink>
  )
}

/**
 * The desktop navigation. Collapsible to its icons (the app's mark and each item's),
 * remembered in this browser. `compact`: only on wide screens, for pages that need the
 * room (the design canvas).
 */
export function Sidebar({ compact = false }: { compact?: boolean }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = () =>
    setCollapsed((was) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, was ? '0' : '1')
      } catch {
        // Blocked storage: it just isn't remembered.
      }
      return !was
    })
  const label = collapsed ? 'Expand the navigation' : 'Collapse the navigation'
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col gap-6 border-r bg-sidebar p-3',
        collapsed ? 'w-14 px-2' : 'w-56',
        compact ? 'lg:flex' : 'md:flex',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 pt-2 font-semibold whitespace-nowrap',
          collapsed ? 'flex-col px-0' : 'pr-0 pl-3',
        )}
      >
        {collapsed ? (
          <HousePlug className="size-5 text-primary" aria-label="Ohm Sweet Ohm" />
        ) : (
          <Brand />
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          className={cn(
            'rounded-md p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            !collapsed && 'ml-auto',
          )}
        >
          <Toggle className="size-4" />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {sidebarNav.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <SidebarLink item={settings} collapsed={collapsed} />
    </aside>
  )
}
