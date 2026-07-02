import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Users2, Bell, BarChart3, Settings, ListChecks, KanbanSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/leads', label: 'Leads', icon: Users2, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/leads/kanban', label: 'Kanban', icon: KanbanSquare, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/companies', label: 'Companies', icon: Building2, roles: ['Admin', 'Manager'] },
  { to: '/followups', label: 'Follow-ups', icon: ListChecks, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['Admin', 'Manager', 'Representative'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['Admin'] },
]

export function Sidebar({ className }) {
  const { user } = useAuth()
  if (!user) return null
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <nav className={cn('flex flex-col gap-1 p-3', className)}>
      <div className="px-2 py-3">
        <div className="text-lg font-semibold tracking-tight">LeadFlow</div>
        <div className="text-xs text-muted-foreground">Internal sales workspace</div>
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/leads'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
