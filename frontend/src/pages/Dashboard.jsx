import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ListTodo, Boxes, Wallet, UserCog, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { LeadStatusBadge } from '@/components/shared/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { hasRole, canSeeLeadModule } from '@/api/scope'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { useAllocationTasks, useResourceAllocations } from '@/hooks/useResources'
import { useFinanceGates } from '@/hooks/useFinance'
import { useUsers } from '@/hooks/useUsers'
import { formatDate } from '@/lib/format'

function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && <Icon className="size-8 text-muted-foreground/40" />}
      </CardContent>
    </Card>
  )
}

// The dashboard is module-scoped: a lead-facing user sees the leads funnel; a
// pure Resource Manager / Finance / User-Management user sees their module's
// dashboard instead. Each sub-dashboard owns its data hooks (hooks rules).
export default function Dashboard() {
  const { user } = useAuth()
  if (canSeeLeadModule(user)) return <LeadDashboard user={user} />
  if (hasRole(user, 'Resource Manager')) return <ResourceDashboard />
  if (hasRole(user, 'Finance')) return <FinanceDashboard />
  if (hasRole(user, 'User Management')) return <UserManagementDashboard />
  return <LeadDashboard user={user} />
}

function LeadDashboard({ user }) {
  const { data, isLoading } = useDashboardSummary()

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>

  const statusMax = Math.max(1, ...data.count_by_status.map((s) => s.count))
  const isLeadAdmin = hasRole(user, 'Lead Admin')
  const isLeadManager = hasRole(user, 'Lead Manager')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLeadManager || isLeadAdmin ? 'Dashboard' : 'My work'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isLeadAdmin && 'Lead health across the whole company — view only.'}
          {!isLeadAdmin && isLeadManager && 'Your leads and team follow-ups.'}
          {!isLeadAdmin && !isLeadManager && 'Everything currently assigned to you.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active leads" value={data.active_lead_count} icon={ListTodo} hint={`${data.total_leads} total in scope`} />
        <StatCard label="Overdue follow-ups" value={data.overdue_followups.length} icon={AlertTriangle} hint="Need attention" />
        <StatCard label="Completed" value={data.completed_count} icon={CheckCircle2} hint={`${data.dropped_count} dropped`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Leads by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.count_by_status.filter((s) => s.count > 0).map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <div className="w-28 shrink-0"><LeadStatusBadge status={s.status} /></div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / statusMax) * 100}%` }} />
                </div>
                <div className="w-8 shrink-0 text-right text-sm tabular-nums">{s.count}</div>
              </div>
            ))}
            {data.count_by_status.every((s) => s.count === 0) && <p className="text-sm text-muted-foreground">No leads in scope yet.</p>}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Overdue follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.overdue_followups.length === 0 && <p className="text-sm text-muted-foreground">Nothing overdue. 🎉</p>}
            {data.overdue_followups.map((f) => (
              <Link key={f.id} to={`/leads/${f.lead}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <span className="truncate pr-2">{f.title}</span>
                <Badge variant="destructive" className="shrink-0">{formatDate(f.followup_date)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle className="text-base">{isLeadManager || isLeadAdmin ? 'Active leads in scope' : 'My leads'}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.active_leads.length === 0 && <p className="text-sm text-muted-foreground">No active leads right now.</p>}
          <div className="flex flex-col divide-y">
            {data.active_leads.map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-accent/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{l.company_name} — {l.project_name}</p>
                    <LeadStatusBadge status={l.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{l.project_id_display || 'Project ID pending'}</p>
                </div>
                <ProgressRing value={l.progress} size={36} strokeWidth={3.5} />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Resource Manager module dashboard — allocation workload sourced from the
// R5 append-only endpoints: open allocation *tasks* (staffing still needed)
// and allocation *rows* (who's currently staffed) + a link into the R5
// resource-history dashboard.
function ResourceDashboard() {
  const { data: tasks = [], isLoading: tasksLoading } = useAllocationTasks()
  const { data: rows = [], isLoading: rowsLoading } = useResourceAllocations()

  const awaiting = tasks.filter((t) => t.status === 'open' || t.status === 'hold')
  const staffed = rows.filter((r) => r.status === 'allocated')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resource dashboard</h1>
        <p className="text-sm text-muted-foreground">Allocation tasks waiting on you, and who's currently staffed.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting allocation" value={tasksLoading ? '—' : awaiting.length} icon={Clock} hint="Allocation tasks still open" />
        <StatCard label="Currently staffed" value={rowsLoading ? '—' : staffed.length} icon={Boxes} hint="Active resource assignments" />
        <StatCard label="Total history rows" value={rowsLoading ? '—' : rows.length} icon={ListTodo} hint="All allocation records, incl. released" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Awaiting allocation</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tasksLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!tasksLoading && awaiting.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting on you right now. 🎉</p>}
          {awaiting.map((t) => {
            const required = t.allocation ? Object.values(t.allocation.required).reduce((a, b) => a + b, 0) : 0
            const filled = t.allocation ? Object.values(t.allocation.occupants).reduce((a, list) => a + list.length, 0) : 0
            return (
              <Link key={t.id} to="/resources" className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <span className="truncate pr-2">
                  <span className="font-medium">{t.lead_project_name}</span>
                  <span className="text-muted-foreground"> · Task {t.task_no}. {t.task_name}</span>
                </span>
                <Badge variant="secondary" className="shrink-0">{filled} / {required}</Badge>
              </Link>
            )
          })}
          <Button asChild variant="outline" className="mt-2 self-start"><Link to="/resources">Open resource allocation</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resource history</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Days worked per resource, across every slot/stage/lead they've held — including reassignment chains.
          </p>
          <Button asChild variant="outline" className="self-start"><Link to="/resource-history">Open resource history</Link></Button>
        </CardContent>
      </Card>
    </div>
  )
}

// Finance module dashboard — the Accounts queue (open payment gates, R4).
function FinanceDashboard() {
  const { data: gates = [], isLoading } = useFinanceGates()
  const bounced = gates.filter((g) => g.reopened_count > 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance dashboard</h1>
        <p className="text-sm text-muted-foreground">Payment-approval gates awaiting your decision (Tasks 7, 15, 28).</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Open gates" value={isLoading ? '—' : gates.length} icon={Wallet} hint="Awaiting payment confirmation" />
        <StatCard label="Previously bounced" value={isLoading ? '—' : bounced.length} icon={AlertTriangle} hint="Re-opened at least once" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Accounts queue</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && gates.length === 0 && <p className="text-sm text-muted-foreground">Nothing to approve right now. 🎉</p>}
          {gates.map((g) => (
            <Link key={g.id} to="/finance" className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent">
              <span className="truncate pr-2">
                <span className="font-medium">{g.lead_project_name}</span>
                <span className="text-muted-foreground"> · Task {g.task_no}. {g.task_name}</span>
              </span>
              {g.reopened_count > 0 && <Badge variant="secondary" className="shrink-0">Bounced {g.reopened_count}×</Badge>}
            </Link>
          ))}
          <Button asChild variant="outline" className="mt-2 self-start"><Link to="/finance">Open Accounts queue</Link></Button>
        </CardContent>
      </Card>
    </div>
  )
}

function UserManagementDashboard() {
  const { data: users = [], isLoading } = useUsers()
  const active = users.filter((u) => u.active ?? u.is_active).length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">User management dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage the people who can access the system.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total users" value={isLoading ? '—' : users.length} icon={UserCog} />
        <StatCard label="Active users" value={isLoading ? '—' : active} icon={CheckCircle2} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">Add, edit, and deactivate user accounts and their roles.</p>
          <Button asChild variant="outline" className="self-start"><Link to="/users">Open user management</Link></Button>
        </CardContent>
      </Card>
    </div>
  )
}
