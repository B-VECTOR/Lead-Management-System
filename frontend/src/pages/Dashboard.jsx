import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { LeadStatusBadge } from '@/components/shared/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { hasRole } from '@/api/scope'
import { useDashboardSummary } from '@/hooks/useDashboard'
import { formatDate } from '@/lib/format'

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
        <Card className="lg:col-span-2">
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

        <Card>
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

      <Card>
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
                  <p className="text-xs text-muted-foreground">{l.project_id || 'Project ID pending'}</p>
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
