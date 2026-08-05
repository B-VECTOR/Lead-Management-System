import { CalendarClock, CheckCircle2, ListChecks, PauseCircle, Users2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SlotBadge, StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { BarChart, ChartCard, ChartTable, StatTile, statusColor } from '@/components/charts'
import { formatDate } from '@/lib/format'
import { DashboardHeader, ListCard, ListRow, ViewAllButton, days } from './shared'

// "My work" — what the signed-in user personally owes, whatever roles they
// hold. For a plain Employee this *is* the dashboard: they have no lead scope,
// and the pre-R20 build handed them a leads funnel that was always empty.
export function MyWorkDashboard({ data, standalone = true }) {
  const t = data.totals

  const workload = [
    { label: 'Open tasks', count: t.open_tasks, color: statusColor('open') },
    { label: 'On hold', count: t.held_tasks, color: statusColor('hold') },
    { label: 'Completed', count: t.closed_tasks, color: statusColor('closed') },
  ]

  const followupBuckets = [
    { label: 'Overdue', count: t.overdue_followups, color: statusColor('Dropped') },
    { label: 'Due today', count: t.due_today, color: statusColor('Hold') },
    {
      label: 'Upcoming',
      count: Math.max(0, t.open_followups - t.overdue_followups - t.due_today),
      color: statusColor('In Progress'),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {standalone && (
        <DashboardHeader
          title="My work"
          subtitle="Everything currently assigned to you — tasks, follow-ups and the slots you hold."
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open tasks" value={t.open_tasks} hint={`${t.held_tasks} on hold`} icon={ListChecks} />
        <StatTile
          label="Overdue follow-ups"
          value={t.overdue_followups}
          hint={`${t.open_followups} open in total`}
          icon={CalendarClock}
          tone={t.overdue_followups > 0 ? 'var(--chart-status-dropped)' : undefined}
        />
        <StatTile
          label="Current allocations"
          value={t.current_allocations}
          hint="Slots you hold right now"
          icon={Users2}
        />
        <StatTile
          label="Days worked"
          value={t.days_worked}
          hint="Across every slot you have held"
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="My task workload"
          subtitle="Every task instance assigned to me"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'State' },
                { key: 'count', label: 'Tasks', align: 'right' },
              ]}
              rows={workload}
            />
          }
        >
          {/* Status colours, because these bars mean state — not identity. */}
          <BarChart rows={workload} colorFor={(row) => row.color} emptyMessage="No tasks assigned to you." />
        </ChartCard>

        <ChartCard
          title="Follow-ups by due date"
          subtitle="Open follow-ups assigned to me"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Due' },
                { key: 'count', label: 'Follow-ups', align: 'right' },
              ]}
              rows={followupBuckets}
            />
          }
        >
          <BarChart rows={followupBuckets} colorFor={(row) => row.color} emptyMessage="No open follow-ups." />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Open tasks"
          count={t.open_tasks}
          empty="Nothing open. 🎉"
          action={<ViewAllButton to="/leads">Leads</ViewAllButton>}
        >
          {data.open_tasks.map((task) => (
            <ListRow
              key={task.id}
              to={`/leads/${task.lead}`}
              title={`Task ${task.task_no}. ${task.task_name}`}
              meta={`${task.project_id || task.company_name} · ${task.project_name}`}
              right={
                <>
                  {task.stage && <StageBadge stage={task.stage} />}
                  <Badge variant="secondary" className="tabular-nums">{days(task.age_days)}</Badge>
                </>
              }
            />
          ))}
        </ListCard>

        <ListCard
          title="Follow-ups"
          count={t.open_followups}
          empty="No follow-ups assigned to you."
          action={<ViewAllButton to="/other-tasks">Other tasks</ViewAllButton>}
        >
          {data.followups.map((f) => (
            <ListRow
              key={f.id}
              to={`/leads/${f.lead}`}
              title={f.title}
              meta={f.company_name}
              right={
                <Badge variant={f.days_overdue > 0 ? 'destructive' : 'secondary'}>
                  {f.days_overdue > 0 ? `${f.days_overdue}d late` : formatDate(f.followup_date)}
                </Badge>
              }
            />
          ))}
        </ListCard>
      </div>

      {data.held_tasks.length > 0 && (
        <ListCard
          title="My tasks on hold"
          count={data.held_tasks.length}
          action={<ViewAllButton to="/held-tasks">Held tasks</ViewAllButton>}
        >
          {data.held_tasks.map((task) => (
            <ListRow
              key={task.id}
              to={`/leads/${task.lead}`}
              title={`Task ${task.task_no}. ${task.task_name}`}
              meta={`${task.project_id || task.company_name} · ${task.project_name}`}
              right={<TaskStateBadge status={task.status} />}
            />
          ))}
        </ListCard>
      )}

      {data.allocations.length > 0 && (
        <ListCard title="Slots I hold" count={data.allocations.length}>
          {data.allocations.map((row) => (
            <ListRow
              key={row.id}
              to={`/leads/${row.lead}`}
              title={`${row.company_name} — ${row.project_name}`}
              meta={`${row.project_id || '—'} · since ${formatDate(row.allocated_on)}`}
              right={
                <>
                  <SlotBadge slot={row.slot} />
                  <Badge variant="secondary" className="tabular-nums">{row.days_worked}d</Badge>
                </>
              }
            />
          ))}
        </ListCard>
      )}

      {standalone && t.open_tasks === 0 && t.open_followups === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <PauseCircle className="size-4" /> Nothing is waiting on you right now.
        </p>
      )}
    </div>
  )
}

export default MyWorkDashboard
