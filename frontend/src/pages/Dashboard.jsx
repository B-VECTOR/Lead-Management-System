import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { LeadStatusBadge } from '@/components/shared/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { useCompanies } from '@/hooks/useCompanies'
import { formatDate, isOverdue } from '@/lib/format'

function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <Card>
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

export default function Dashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useDashboardSummary()
  const { data: companies = [] } = useCompanies()

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])

  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>

  const statusMax = Math.max(1, ...data.countByStatus.map((s) => s.count))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.role === 'Representative' ? 'My work' : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.role === 'Admin' && 'Lead health across the whole company.'}
          {user.role === 'Manager' && 'Your leads and team follow-ups.'}
          {user.role === 'Representative' && 'Everything currently assigned to you.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active leads" value={data.activeLeadCount} icon={ListTodo} hint={`${data.totalLeads} total in scope`} />
        <StatCard label="Overdue follow-ups" value={data.overdueFollowups.length} icon={AlertTriangle} hint="Need attention" />
        <StatCard label="Completed" value={data.completedCount} icon={CheckCircle2} hint={`${data.droppedCount} dropped`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Leads by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.countByStatus.filter((s) => s.count > 0).map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <div className="w-28 shrink-0"><LeadStatusBadge status={s.status} /></div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / statusMax) * 100}%` }} />
                </div>
                <div className="w-8 shrink-0 text-right text-sm tabular-nums">{s.count}</div>
              </div>
            ))}
            {data.countByStatus.every((s) => s.count === 0) && <p className="text-sm text-muted-foreground">No leads in scope yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overdue follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.overdueFollowups.length === 0 && <p className="text-sm text-muted-foreground">Nothing overdue. 🎉</p>}
            {data.overdueFollowups.map((f) => (
              <Link key={f.id} to={`/leads/${f.lead_id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <span className="truncate pr-2">{f.title}</span>
                <Badge variant="destructive" className="shrink-0">{formatDate(f.due_date)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{user.role === 'Representative' ? 'My leads' : 'Active leads in scope'}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.activeLeads.length === 0 && <p className="text-sm text-muted-foreground">No active leads right now.</p>}
          <div className="flex flex-col divide-y">
            {data.activeLeads.map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-accent/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{companyById[l.company_id]?.name || l.code}</p>
                  <p className={`text-xs ${isOverdue(l.target_date) ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {l.code} · Target: {formatDate(l.target_date)}
                  </p>
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
