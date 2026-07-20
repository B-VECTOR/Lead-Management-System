import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users2, Bell, Boxes, Wallet, UserCog, PauseCircle, ListChecks, ListTodo, FileCheck2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { hasRole, canSeeLeadModule, canSeeFollowUps, canSeeHeldLeads, canSeeHeldTasks } from '@/api/scope'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Logo } from './Logo'

// Nav is module-scoped. Items with neither `roles` nor `show` are visible to
// every signed-in user (Dashboard, Notifications). `roles` gates an item to
// specific roles; `show(user)` is a predicate for finer module gating. The
// Lead-module items are hidden from pure back-office users (Resource Manager /
// Finance / User Management) via `canSeeLeadModule`.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users2, show: canSeeLeadModule },
  { to: '/other-tasks', label: 'Follow up', icon: ListTodo, show: canSeeFollowUps },
  { to: '/held-leads', label: 'Hold Leads', icon: PauseCircle, show: canSeeHeldLeads },
  { to: '/held-tasks', label: 'Hold Tasks', icon: ListChecks, show: canSeeHeldTasks },
  { to: '/resources', label: 'Resources', icon: Boxes, roles: ['Resource Manager'] },
  { to: '/project-closure', label: 'Project Closure', icon: FileCheck2, roles: ['Resource Manager'] },
  { to: '/finance', label: 'Finance', icon: Wallet, roles: ['Finance'] },
  { to: '/users', label: 'Users', icon: UserCog, roles: ['User Management'] },
  { to: '/notifications', label: 'Notifications', icon: Bell },
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
  const items = NAV_ITEMS.filter((item) => {
    if (item.show && !item.show(user)) return false
    if (item.roles && !item.roles.some((r) => hasRole(user, r))) return false
    return true
  })

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
