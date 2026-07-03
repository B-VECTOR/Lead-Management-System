import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users2, Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Logo } from './Logo'

// Phase 1 nav: Dashboard, Leads, Notifications only. Kanban/Companies/Follow-ups/
// Reports/Settings are removed for now (§21 rework) — Companies and Follow-ups
// functionality still exist, just accessed from inside a lead rather than as
// their own nav destinations. Reports/Settings return in a later phase.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/leads', label: 'Leads', icon: Users2, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['Admin', 'Manager', 'Representative'] },
]

function NavItem({ to, label, icon: Icon, collapsed }) {
  const link = (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && label}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Sidebar({ className, collapsed = false, onToggle }) {
  const { user } = useAuth()
  if (!user) return null
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <nav className={cn('flex h-full flex-col gap-1 p-3', collapsed && 'items-center px-2', className)}>
      <Logo collapsed={collapsed} />
      {items.map((item) => (
        <NavItem key={item.to} {...item} collapsed={collapsed} />
      ))}
      <div className="flex-1" />
      {onToggle && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-muted-foreground"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      )}
    </nav>
  )
}
