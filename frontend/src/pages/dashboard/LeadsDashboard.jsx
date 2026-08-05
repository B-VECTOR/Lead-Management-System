import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ListTodo, Timer, TrendingDown, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { LeadStatusBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import {
  BarChart,
  ChartCard,
  ChartLegend,
  ChartTable,
  ColumnChart,
  DonutChart,
  FunnelChart,
  StatTile,
  ordinalColor,
  seriesColor,
  statusColor,
} from '@/components/charts'
import { hasRole } from '@/api/scope'
import { formatDate } from '@/lib/format'
import { DashboardHeader, ListCard, ListRow, ViewAllButton, days, pct } from './shared'

// The leads analytics page — the Lead Manager's, the Lead Admin's and
// Marketing's dashboard. Same data shape for all three; the copy, the scope
// (own vs all, decided server-side) and two org-wide sections differ.
export function LeadsDashboard({ data, user }) {
  const isAdmin = hasRole(user, 'Lead Admin')
  const isMarketing = hasRole(user, 'Marketing') && !hasRole(user, 'Lead Manager') && !isAdmin
  const t = data.totals

  const statusSlices = useMemo(
    () =>
      data.count_by_status
        .filter((s) => s.count > 0)
        .map((s) => ({ label: s.status, value: s.count, color: statusColor(s.status) })),
    [data.count_by_status],
  )

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title={isAdmin ? 'Lead analytics' : isMarketing ? 'Sourced leads' : 'My pipeline'}
        subtitle={
          isAdmin
            ? 'Every lead in the company — health, throughput and what needs a decision.'
            : isMarketing
              ? 'The leads you brought in, and how far they got.'
              : 'Your book of leads: how it is moving, where it is stuck.'
        }
        actions={<ViewAllButton to="/leads">Open leads list</ViewAllButton>}
      />

      {/* The headline row. Rates, not just counts — a count alone can't tell a
          healthy book from a stalled one. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Active leads"
          value={t.in_progress + t.on_hold}
          hint={`${t.total} in scope · ${t.on_hold} on hold`}
          icon={ListTodo}
        />
        {/* Leakage, not wins: the share of the book that is written off or
            frozen. Over every lead in scope — a hold is not a decided outcome,
            so `decided` is the wrong denominator for it. */}
        <StatTile
          label="Drop & hold rate"
          value={pct(t.drop_hold_rate)}
          hint={t.total ? `${t.dropped} dropped · ${t.on_hold} on hold of ${t.total}` : 'No leads in scope'}
          icon={TrendingDown}
        />
        <StatTile
          label="Avg cycle time"
          value={t.avg_cycle_days == null ? '—' : days(t.avg_cycle_days)}
          hint="Creation → completion, completed leads"
          icon={Timer}
        />
        <StatTile
          label="Needs attention"
          value={data.attention.overdue_followups.length + data.attention.stalled.length}
          hint={`${data.attention.overdue_followups.length} overdue · ${data.attention.stalled.length} stalled`}
          icon={AlertTriangle}
          tone={
            data.attention.overdue_followups.length + data.attention.stalled.length > 0
              ? 'var(--chart-status-dropped)'
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Stage funnel"
          subtitle="Leads that reached each stage, and how much of the previous stage survived"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Stage' },
                { key: 'count', label: 'Reached', align: 'right' },
                {
                  key: 'from_previous',
                  label: 'Of previous',
                  align: 'right',
                  render: (r) => pct(r.from_previous),
                },
              ]}
              rows={data.funnel}
            />
          }
        >
          <FunnelChart steps={data.funnel} emptyMessage="No lead has opened a stage yet." />
        </ChartCard>

        <ChartCard
          title="By status"
          subtitle="Where the book stands right now"
          legend={
            <ChartLegend
              items={statusSlices.map((s) => ({ label: s.label, color: s.color, value: s.value }))}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'status', label: 'Status', render: (r) => <LeadStatusBadge status={r.status} /> },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.count_by_status.filter((s) => s.count > 0)}
            />
          }
        >
          <DonutChart
            slices={statusSlices}
            centerValue={t.total}
            centerLabel="leads"
            emptyMessage="No leads in scope yet."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Throughput"
          subtitle="Leads created, completed and dropped — last 6 months"
          legend={
            <ChartLegend
              items={[
                { label: 'Created', color: seriesColor(0) },
                { label: 'Completed', color: statusColor('Completed') },
                { label: 'Dropped', color: statusColor('Dropped') },
              ]}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Month' },
                { key: 'created', label: 'Created', align: 'right' },
                { key: 'completed', label: 'Completed', align: 'right' },
                { key: 'dropped', label: 'Dropped', align: 'right' },
              ]}
              rows={data.trend}
            />
          }
        >
          <ColumnChart
            rows={data.trend}
            series={[
              { key: 'created', label: 'Created', color: seriesColor(0) },
              { key: 'completed', label: 'Completed', color: statusColor('Completed') },
              { key: 'dropped', label: 'Dropped', color: statusColor('Dropped') },
            ]}
            emptyMessage="Nothing has moved in the last six months."
          />
        </ChartCard>

        <ChartCard
          title="Age of active leads"
          subtitle="Days since the lead was created"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Age' },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.aging}
            />
          }
        >
          {/* An ordered scale, so the ordinal ramp — older bands read darker. */}
          <BarChart
            rows={data.aging}
            colorFor={(_, i) => ordinalColor(i, data.aging.length)}
            emptyMessage="No active leads."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="By industry"
          subtitle="Where the leads come from"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Industry' },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.breakdowns.industry}
            />
          }
        >
          <BarChart rows={data.breakdowns.industry} emptyMessage="No leads yet." />
        </ChartCard>

        <ChartCard
          title="By domain"
          subtitle="The practice area each lead sits in"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Domain' },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.breakdowns.domain}
            />
          }
        >
          <BarChart rows={data.breakdowns.domain} emptyMessage="No leads yet." />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="By project type"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Type' },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.breakdowns.type_of_project}
            />
          }
        >
          <BarChart rows={data.breakdowns.type_of_project} emptyMessage="No leads yet." />
        </ChartCard>

        <ChartCard
          title="By lead type"
          subtitle="BD, Mining and standalone Extension engagements"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Type' },
                { key: 'count', label: 'Leads', align: 'right' },
              ]}
              rows={data.breakdowns.lead_type}
            />
          }
        >
          <BarChart
            rows={data.breakdowns.lead_type}
            colorFor={(_, i) => seriesColor(i)}
            emptyMessage="No leads yet."
          />
        </ChartCard>
      </div>

      {/* Lead Admin only — the §6 "view all leads-funnel" row is what makes a
          per-owner comparison meaningful in the first place. */}
      {isAdmin && data.owners.length > 0 && (
        <ChartCard
          title="By owner"
          subtitle="Active book and drop & hold rate per Default BD Person"
          table={
            <ChartTable
              columns={[
                { key: 'name', label: 'Owner' },
                { key: 'total', label: 'Total', align: 'right' },
                { key: 'in_progress', label: 'Active', align: 'right' },
                { key: 'completed', label: 'Won', align: 'right' },
                { key: 'on_hold', label: 'On hold', align: 'right' },
                { key: 'dropped', label: 'Dropped', align: 'right' },
                { key: 'drop_hold_rate', label: 'Drop & hold', align: 'right', render: (r) => pct(r.drop_hold_rate) },
              ]}
              rows={data.owners}
            />
          }
        >
          <div className="flex flex-col divide-y">
            {data.owners.map((owner) => (
              <div key={owner.id} className="flex items-center gap-3 py-2">
                <span className="w-32 shrink-0 truncate text-sm">{owner.name}</span>
                {/* A stacked bar: the three outcomes of one owner's book, with
                    a 2px surface gap doing the separating. */}
                <span className="flex h-2.5 flex-1 overflow-hidden rounded-sm" style={{ background: 'var(--chart-track)' }}>
                  {[
                    { key: 'in_progress', color: statusColor('In Progress') },
                    { key: 'on_hold', color: statusColor('Hold') },
                    { key: 'completed', color: statusColor('Completed') },
                    { key: 'dropped', color: statusColor('Dropped') },
                  ].map((seg) => (
                    owner[seg.key] > 0 && (
                      <span
                        key={seg.key}
                        className="h-full"
                        style={{
                          width: `${(owner[seg.key] / owner.total) * 100}%`,
                          background: seg.color,
                          borderRight: '2px solid var(--chart-surface)',
                        }}
                        title={`${seg.key.replace('_', ' ')}: ${owner[seg.key]}`}
                      />
                    )
                  ))}
                </span>
                <span className="w-10 text-right text-xs tabular-nums">{owner.total}</span>
                <span
                  className="w-14 text-right text-xs tabular-nums text-muted-foreground"
                  title={`${owner.drop_hold} dropped or on hold of ${owner.total}`}
                >
                  {pct(owner.drop_hold_rate)}
                </span>
              </div>
            ))}
          </div>
          <ChartLegend
            items={[
              { label: 'In progress', color: statusColor('In Progress') },
              { label: 'On hold', color: statusColor('Hold') },
              { label: 'Completed', color: statusColor('Completed') },
              { label: 'Dropped', color: statusColor('Dropped') },
            ]}
          />
        </ChartCard>
      )}

      {/* Everything asking for a decision, in one band. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Overdue follow-ups"
          subtitle="Assigned to you, past their date"
          count={data.attention.overdue_followups.length}
          action={<ViewAllButton to="/other-tasks">Other tasks</ViewAllButton>}
          empty="Nothing overdue. 🎉"
        >
          {data.attention.overdue_followups.map((f) => (
            <ListRow
              key={f.id}
              to={`/leads/${f.lead}`}
              title={f.title}
              meta={f.company_name}
              right={
                <Badge variant="destructive" className="shrink-0">
                  {f.days_overdue}d late · {formatDate(f.followup_date)}
                </Badge>
              }
            />
          ))}
        </ListCard>

        <ListCard
          title="Stalled leads"
          subtitle="In progress, but no task has closed in 14+ days"
          count={data.attention.stalled.length}
          empty="Everything is moving. 🎉"
        >
          {data.attention.stalled.map((lead) => (
            <ListRow
              key={lead.id}
              to={`/leads/${lead.id}`}
              title={`${lead.company_name} — ${lead.project_name}`}
              meta={`${lead.project_id_display || 'Project ID pending'} · idle ${days(lead.idle_days)}`}
              right={<ProgressRing value={lead.progress} size={32} strokeWidth={3} />}
            />
          ))}
        </ListCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="On hold"
          subtitle="Paused leads, oldest first"
          count={data.attention.held_leads.length}
          action={<ViewAllButton to="/held-leads">Held leads</ViewAllButton>}
          empty="Nothing is on hold."
        >
          {data.attention.held_leads.map((lead) => (
            <ListRow
              key={lead.id}
              to={`/leads/${lead.id}`}
              title={`${lead.company_name} — ${lead.project_name}`}
              meta={lead.reason || 'No reason recorded'}
              right={<Badge variant="secondary">{days(lead.days_held)}</Badge>}
            />
          ))}
        </ListCard>

        <ListCard
          title="Waiting for an owner"
          subtitle="Marketing-sourced leads with nobody assigned — the workflow starts on assignment"
          count={data.attention.unassigned.length}
          empty="Every lead has an owner."
        >
          {data.attention.unassigned.map((lead) => (
            <ListRow
              key={lead.id}
              to={`/leads/${lead.id}`}
              title={`${lead.company_name} — ${lead.project_name}`}
              meta={<span className="inline-flex items-center gap-1"><UserPlus className="size-3" /> waiting {days(lead.waiting_days)}</span>}
              right={<LeadTypeBadge type={lead.lead_type} />}
            />
          ))}
        </ListCard>
      </div>

      <ListCard
        title="Active leads"
        subtitle="In progress or on hold, with workflow progress"
        count={data.active_leads.length}
        action={<ViewAllButton to="/leads">All leads</ViewAllButton>}
        empty="No active leads right now."
      >
        <div className="flex flex-col divide-y">
          {data.active_leads.map((lead) => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="flex items-center justify-between gap-3 py-3 hover:bg-accent/50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {lead.company_name} — {lead.project_name}
                  </p>
                  <LeadStatusBadge status={lead.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {lead.project_id_display || 'Project ID pending'}
                  {lead.owner ? ` · ${lead.owner}` : ' · Not assigned'}
                </p>
              </div>
              <ProgressRing value={lead.progress} size={36} strokeWidth={3.5} />
            </Link>
          ))}
        </div>
      </ListCard>

      <p className="text-xs text-muted-foreground">
        {data.scope === 'all' ? 'Scope: every lead in the company.' : 'Scope: leads you own, created, or work a task on.'}
        {' '}
        <Link to="/leads" className="underline">Open the leads list</Link> for the full filterable table.
      </p>
    </div>
  )
}

export default LeadsDashboard
