import { Boxes, Clock, UserCheck, Users2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  ChartCard,
  ChartLegend,
  ChartTable,
  ColumnChart,
  Meter,
  StatTile,
  ordinalColor,
  seriesColor,
  statusColor,
} from '@/components/charts'
import { DashboardHeader, ListCard, ListRow, ViewAllButton, days, pct } from './shared'

// Resource-module analytics (PRD §5.7): what is waiting to be staffed, who is
// on what, and who is free. The queue screen tells you *what to do next*; this
// tells you whether the bench can absorb it.
export function ResourceDashboard({ data }) {
  const t = data.totals
  const unfilledFirst = data.fill.filter((row) => row.required > row.filled)

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Resource analytics"
        subtitle="Staffing demand against the bench, and how people are being used."
        actions={
          <>
            <ViewAllButton to="/resources">Allocation queue</ViewAllButton>
            <ViewAllButton to="/resource-history">Resource history</ViewAllButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Awaiting allocation"
          value={t.open_tasks}
          hint={`${unfilledFirst.length} still short of people`}
          icon={Clock}
          tone={unfilledFirst.length > 0 ? 'var(--chart-status-hold)' : undefined}
        />
        <StatTile
          label="Slots filled"
          value={`${t.slots_filled} / ${t.slots_required}`}
          hint={t.unfilled > 0 ? `${t.unfilled} unfilled` : 'Fully staffed'}
          icon={UserCheck}
          meter={
            <Meter
              value={t.slots_filled}
              max={Math.max(1, t.slots_required)}
              color={t.unfilled > 0 ? 'var(--chart-status-hold)' : 'var(--chart-status-complete)'}
              label={`${pct(t.fill_rate)} of required headcount`}
            />
          }
        />
        <StatTile
          label="People allocated"
          value={t.people_allocated}
          hint={`${t.projects_staffed} project${t.projects_staffed === 1 ? '' : 's'} staffed`}
          icon={Users2}
        />
        <StatTile
          label="On the bench"
          value={t.bench}
          hint={`${t.reassignments} reassignment${t.reassignments === 1 ? '' : 's'} on record`}
          icon={Boxes}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Fill rate by open task"
          subtitle="Least-staffed first — the queue in the order it needs work"
          table={
            <ChartTable
              columns={[
                { key: 'project_name', label: 'Project' },
                { key: 'task_name', label: 'Task', render: (r) => `${r.task_no}. ${r.task_name}` },
                { key: 'filled', label: 'Filled', align: 'right', render: (r) => `${r.filled} / ${r.required}` },
                { key: 'fill_rate', label: 'Rate', align: 'right', render: (r) => pct(r.fill_rate) },
              ]}
              rows={data.fill}
              emptyMessage="Nothing waiting to be staffed."
            />
          }
        >
          {data.fill.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing waiting on you. 🎉</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.fill.slice(0, 8).map((row) => (
                <div key={row.task} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">
                      <span className="font-medium tabular-nums">{row.project_id || row.company_name}</span>
                      <span className="text-muted-foreground"> · Task {row.task_no}. {row.task_name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {row.filled} / {row.required}
                    </span>
                  </div>
                  <Meter
                    className="mt-0"
                    value={row.filled}
                    max={Math.max(1, row.required)}
                    color={
                      row.filled >= row.required
                        ? 'var(--chart-status-complete)'
                        : row.filled === 0
                          ? 'var(--chart-status-dropped)'
                          : 'var(--chart-status-hold)'
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Who is staffed as what"
          subtitle="Current allocations by slot family"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Slot' },
                { key: 'count', label: 'People', align: 'right' },
              ]}
              rows={data.by_slot}
            />
          }
        >
          <BarChart
            rows={data.by_slot}
            colorFor={(_, i) => seriesColor(i)}
            emptyMessage="Nobody is allocated right now."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Allocation churn"
          subtitle="Slots filled vs released — last 6 months"
          legend={
            <ChartLegend
              items={[
                { label: 'Allocated', color: statusColor('In Progress') },
                { label: 'Released', color: statusColor('Completed') },
              ]}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Month' },
                { key: 'allocated', label: 'Allocated', align: 'right' },
                { key: 'released', label: 'Released', align: 'right' },
              ]}
              rows={data.trend}
            />
          }
        >
          <ColumnChart
            rows={data.trend}
            series={[
              { key: 'allocated', label: 'Allocated', color: statusColor('In Progress') },
              { key: 'released', label: 'Released', color: statusColor('Completed') },
            ]}
            emptyMessage="No allocation activity in the last six months."
          />
        </ChartCard>

        <ChartCard
          title="Bench by belt"
          subtitle="Free vs currently allocated"
          legend={
            <ChartLegend
              items={[
                { label: 'Allocated', color: statusColor('In Progress') },
                { label: 'Free', color: 'var(--chart-neutral)' },
              ]}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Belt' },
                { key: 'allocated', label: 'Allocated', align: 'right' },
                { key: 'free', label: 'Free', align: 'right' },
              ]}
              rows={data.bench}
            />
          }
        >
          {data.bench.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No belt-holders on record.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.bench.map((row) => {
                const total = row.allocated + row.free
                return (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{row.label}</span>
                    <span className="flex h-2.5 flex-1 overflow-hidden rounded-sm" style={{ background: 'var(--chart-track)' }}>
                      {row.allocated > 0 && (
                        <span
                          className="h-full"
                          style={{
                            width: `${(row.allocated / total) * 100}%`,
                            background: statusColor('In Progress'),
                            borderRight: '2px solid var(--chart-surface)',
                          }}
                        />
                      )}
                      {row.free > 0 && (
                        <span
                          className="h-full"
                          style={{ width: `${(row.free / total) * 100}%`, background: 'var(--chart-neutral)' }}
                        />
                      )}
                    </span>
                    <span className="w-14 text-right text-xs tabular-nums">
                      {row.free} free
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Utilization"
          subtitle="Days worked and concurrent projects, per person"
          table={
            <ChartTable
              columns={[
                { key: 'name', label: 'Resource' },
                { key: 'current_allocations', label: 'Slots', align: 'right' },
                { key: 'concurrent_projects', label: 'Projects', align: 'right' },
                { key: 'days_worked', label: 'Days', align: 'right' },
              ]}
              rows={data.utilization}
              emptyMessage="Nobody has been allocated yet."
            />
          }
        >
          <BarChart
            rows={data.utilization.slice(0, 10).map((p) => ({
              key: p.id,
              label: p.name,
              count: p.days_worked,
              hint: `${p.current_allocations} slot(s), ${p.concurrent_projects} project(s)`,
            }))}
            formatValue={(v) => `${v}d`}
            emptyMessage="Nobody has been allocated yet."
          />
        </ChartCard>

        <ChartCard
          title="Allocations by stage"
          subtitle="Which stage the staffed work sits in"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Stage' },
                { key: 'count', label: 'Allocations', align: 'right' },
              ]}
              rows={data.by_stage}
            />
          }
        >
          <BarChart
            rows={data.by_stage}
            colorFor={(_, i) => ordinalColor(i, Math.max(2, data.by_stage.length))}
            emptyMessage="No staffed stages."
          />
        </ChartCard>
      </div>

      <ListCard
        title="Awaiting allocation"
        subtitle="Allocation tasks open on the queue"
        count={data.fill.length}
        action={<ViewAllButton to="/resources">Open queue</ViewAllButton>}
        empty="Nothing waiting on you. 🎉"
      >
        {data.fill.map((row) => (
          <ListRow
            key={row.task}
            to="/resources"
            title={
              <>
                <span className="font-medium tabular-nums">{row.project_id || '—'}</span>
                {' · '}
                {row.project_name}
              </>
            }
            meta={`Task ${row.task_no}. ${row.task_name} · open ${days(row.age_days)}`}
            right={
              <Badge variant={row.filled >= row.required ? 'secondary' : 'destructive'}>
                {row.filled} / {row.required}
              </Badge>
            }
          />
        ))}
      </ListCard>

      {data.utilization.length > 0 && (
        <ListCard title="Currently allocated" count={data.utilization.filter((p) => p.current_allocations > 0).length}>
          {data.utilization
            .filter((p) => p.current_allocations > 0)
            .map((person) => (
              <ListRow
                key={person.id}
                title={person.name}
                meta={`${person.concurrent_projects} concurrent project${person.concurrent_projects === 1 ? '' : 's'} · ${person.days_worked} days worked`}
                right={person.slots.map((slot) => (
                  <Badge key={slot} variant="secondary">{slot}</Badge>
                ))}
              />
            ))}
        </ListCard>
      )}
    </div>
  )
}

export default ResourceDashboard
