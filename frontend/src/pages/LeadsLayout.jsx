import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/leads', label: 'Lead', end: true },
  { to: '/leads/tasks', label: 'Task', end: false },
  { to: '/leads/additional-tasks', label: 'Additional Task', end: false },
]

// The "Leads" section is a shell around 3 sibling views (not tabs on a single
// lead — see specs.md §13): the leads list itself, a cross-lead task list,
// and a cross-lead additional-tasks (follow-up) list.
export default function LeadsLayout() {
  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px]">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
