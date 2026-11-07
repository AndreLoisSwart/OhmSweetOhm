import { Cpu, Settings, Workflow, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const designs: NavItem = { to: '/', label: 'Designs', icon: Workflow }
export const parts: NavItem = { to: '/parts', label: 'Parts', icon: Cpu }
export const settings: NavItem = { to: '/settings', label: 'Settings', icon: Settings }

// Desktop sidebar, top to bottom. Settings sits apart at the bottom.
export const sidebarNav = [designs, parts]
// Mobile bottom bar, left to right.
export const bottomNav = [designs, parts, settings]
