import { useMemo, useState } from 'react'
import { Boxes, LayoutDashboard, UserCog, Wallet, ListChecks } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/context/AuthContext'
import { canSeeLeadModule, canSeeMyWork, hasRole } from '@/api/scope'
import {
  useDashboardSummary,
  useFinanceDashboard,
  useResourceDashboard,
  useUserDashboard,
} from '@/hooks/useDashboard'
import { DashboardError, DashboardSkeleton } from './dashboard/shared'
import LeadsDashboard from './dashboard/LeadsDashboard'
import MyWorkDashboard from './dashboard/MyWorkDashboard'
import ResourceDashboard from './dashboard/ResourceDashboard'
import FinanceDashboard from './dashboard/FinanceDashboard'
import UserManagementDashboard from './dashboard/UserManagementDashboard'

// The dashboard is module-scoped, and a user gets **every** module they hold —
// as tabs when there is more than one.
//
// Before R20 this was an `if` chain that returned on the first match, so a Lead
// Manager who was also the Resource Manager only ever saw the leads funnel.
// The module list comes from the same `scope.js` helpers the sidebar uses, so
// the dashboard and the nav can't disagree about what a role owns.
function modulesFor(user) {
  const modules = []
  if (canSeeLeadModule(user)) {
    modules.push({ id: 'leads', label: 'Leads', icon: LayoutDashboard })
  }
  if (hasRole(user, 'Resource Manager')) {
    modules.push({ id: 'resources', label: 'Resources', icon: Boxes })
  }
  if (hasRole(user, 'Finance')) {
    modules.push({ id: 'finance', label: 'Accounts', icon: Wallet })
  }
  if (hasRole(user, 'User Management')) {
    modules.push({ id: 'users', label: 'Users', icon: UserCog })
  }
  // "My work" is everyone's — it is the only tab a plain Employee needs, and a
  // useful second tab for everyone else. It goes last except when it is the
  // only lead-side view the user has. The one exception is User Management,
  // which can never hold a task/follow-up/allocation at all (`canSeeMyWork`),
  // so the section would always render zeros for them.
  if (canSeeMyWork(user)) {
    modules.push({ id: 'my-work', label: 'My work', icon: ListChecks })
  }
  return modules
}

export default function Dashboard() {
  const { user } = useAuth()
  const modules = useMemo(() => modulesFor(user), [user])
  const [tab, setTab] = useState(modules[0]?.id ?? 'my-work')

  // Fetch only what is on screen: the leads payload also carries `my_work`, so
  // those two tabs share one request — and a user who holds neither module (a
  // User Management holder) doesn't fire it at all.
  const needsLeadsPayload = modules.some((m) => m.id === 'leads' || m.id === 'my-work')
  const leads = useDashboardSummary(needsLeadsPayload)
  const resources = useResourceDashboard(tab === 'resources')
  const finance = useFinanceDashboard(tab === 'finance')
  const users = useUserDashboard(tab === 'users')

  const panels = {
    leads: <ModulePanel query={leads} render={(data) => <LeadsDashboard data={data} user={user} />} />,
    'my-work': (
      <ModulePanel query={leads} tiles={4} render={(data) => <MyWorkDashboard data={data.my_work} />} />
    ),
    resources: <ModulePanel query={resources} render={(data) => <ResourceDashboard data={data} />} />,
    finance: <ModulePanel query={finance} render={(data) => <FinanceDashboard data={data} />} />,
    users: <ModulePanel query={users} render={(data) => <UserManagementDashboard data={data} />} />,
  }

  if (modules.length === 1) return panels[modules[0].id]

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
        {modules.map((m) => (
          <TabsTrigger key={m.id} value={m.id} className="gap-1.5">
            <m.icon />
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {modules.map((m) => (
        <TabsContent key={m.id} value={m.id}>
          {panels[m.id]}
        </TabsContent>
      ))}
    </Tabs>
  )
}

// Loading / error / data, in one place so every module behaves the same. The
// previous render is held at reduced opacity on a refetch rather than being
// replaced by a skeleton, so nothing jumps.
function ModulePanel({ query, render, tiles = 4 }) {
  const { data, isLoading, isError, isFetching } = query
  if (isLoading || (!data && isFetching)) return <DashboardSkeleton tiles={tiles} />
  if (isError) return <DashboardError />
  if (!data) return <DashboardSkeleton tiles={tiles} />
  return (
    <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {render(data)}
    </div>
  )
}
