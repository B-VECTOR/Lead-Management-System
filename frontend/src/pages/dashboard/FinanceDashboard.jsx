import { AlertTriangle, Banknote, Timer, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  ChartCard,
  ChartLegend,
  ChartTable,
  ColumnChart,
  StatTile,
  ordinalColor,
  seriesColor,
  statusColor,
} from '@/components/charts'
import { formatCompactCurrency, formatCurrency } from '@/lib/format'
import { DashboardHeader, ListCard, ListRow, ViewAllButton, days, num } from './shared'

// Fees are held in rupees (`project_details.fixed_fee` / `variable_fee`), so
// the money on this page is formatted as INR rather than the helper's default.
const money = (v) => formatCurrency(v, 'INR')
const compactMoney = (v) => formatCompactCurrency(v, 'INR')

// Finance analytics (PRD §5.10): the approval queue, how often payment bounces,
// and what has actually been recognized.
//
// Note what this page does *not* claim: there is no pipeline value in the data
// model, so "recognized" means fees snapshotted when an implementation or
// extension cycle closed — not forecast revenue.
export function FinanceDashboard({ data }) {
  const t = data.totals

  const gateSeries = data.by_gate.map((g) => ({
    label: g.label,
    open: g.open,
    cleared: g.cleared,
    bounced: g.bounced,
  }))

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Accounts analytics"
        subtitle="Payment-approval gates, chase cycles, and fees recognized at cycle close."
        actions={<ViewAllButton to="/finance">Open Accounts queue</ViewAllButton>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Open gates"
          value={t.open_gates}
          hint={t.oldest_open_days ? `oldest open ${days(t.oldest_open_days)}` : 'Queue is clear'}
          icon={Wallet}
        />
        <StatTile
          label="Chasing payment"
          value={t.chasing}
          hint={`${t.reopens} bounce${t.reopens === 1 ? '' : 's'} in total`}
          icon={AlertTriangle}
          tone={t.chasing > 0 ? 'var(--chart-status-dropped)' : undefined}
        />
        <StatTile
          label="Avg time to clear"
          value={t.avg_clear_days == null ? '—' : days(t.avg_clear_days)}
          hint={`${t.cleared} gate${t.cleared === 1 ? '' : 's'} cleared`}
          icon={Timer}
        />
        <StatTile
          label="Recognized fees"
          value={compactMoney(t.recognized_total)}
          hint={`${num(t.cycles_closed)} cycle${t.cycles_closed === 1 ? '' : 's'} closed`}
          icon={Banknote}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Gates by checkpoint"
          subtitle="Open, cleared and bounced per approval gate"
          legend={
            <ChartLegend
              items={[
                { label: 'Open', color: statusColor('In Progress') },
                { label: 'Cleared', color: statusColor('Completed') },
                { label: 'Bounced', color: statusColor('Dropped') },
              ]}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Gate' },
                { key: 'open', label: 'Open', align: 'right' },
                { key: 'cleared', label: 'Cleared', align: 'right' },
                { key: 'bounced', label: 'Bounced', align: 'right' },
              ]}
              rows={gateSeries}
            />
          }
        >
          <ColumnChart
            rows={gateSeries}
            series={[
              { key: 'open', label: 'Open', color: statusColor('In Progress') },
              { key: 'cleared', label: 'Cleared', color: statusColor('Completed') },
              { key: 'bounced', label: 'Bounced', color: statusColor('Dropped') },
            ]}
            emptyMessage="No gate has been reached yet."
          />
        </ChartCard>

        <ChartCard
          title="How long gates have been open"
          subtitle="Age of the current queue"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Age' },
                { key: 'count', label: 'Gates', align: 'right' },
              ]}
              rows={data.aging}
            />
          }
        >
          <BarChart
            rows={data.aging}
            colorFor={(_, i) => ordinalColor(i, data.aging.length)}
            emptyMessage="Nothing is waiting."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Fees recognized"
          subtitle="Fixed and variable, snapshotted when a cycle closed — last 6 months"
          legend={
            <ChartLegend
              items={[
                { label: 'Fixed fee', color: seriesColor(0) },
                { label: 'Variable fee', color: seriesColor(1) },
              ]}
            />
          }
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Month' },
                { key: 'fixed', label: 'Fixed', align: 'right', render: (r) => money(r.fixed) },
                { key: 'variable', label: 'Variable', align: 'right', render: (r) => money(r.variable) },
                { key: 'cycles', label: 'Cycles', align: 'right' },
              ]}
              rows={data.revenue_trend}
            />
          }
        >
          <ColumnChart
            rows={data.revenue_trend}
            series={[
              { key: 'fixed', label: 'Fixed fee', color: seriesColor(0) },
              { key: 'variable', label: 'Variable fee', color: seriesColor(1) },
            ]}
            formatValue={compactMoney}
            emptyMessage="No cycle has closed in the last six months."
          />
        </ChartCard>

        <ChartCard
          title="By cycle type"
          subtitle="Implementation, extension loops and mining cycles"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Cycle' },
                { key: 'count', label: 'Cycles', align: 'right' },
                { key: 'value', label: 'Fees', align: 'right', render: (r) => money(r.value) },
              ]}
              rows={data.by_cycle}
            />
          }
        >
          <BarChart
            rows={data.by_cycle}
            valueKey="value"
            formatValue={compactMoney}
            colorFor={(_, i) => seriesColor(i)}
            emptyMessage="No cycle has closed yet."
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Accounts queue"
          subtitle="Gates awaiting your decision"
          count={data.queue.length}
          action={<ViewAllButton to="/finance">Work the queue</ViewAllButton>}
          empty="Nothing to approve right now. 🎉"
        >
          {data.queue.map((gate) => (
            <ListRow
              key={gate.id}
              to="/finance"
              title={
                <>
                  <span className="font-medium tabular-nums">{gate.project_id || '—'}</span>
                  {' · '}
                  {gate.project_name}
                </>
              }
              meta={`Task ${gate.task_no}. ${gate.task_name} · open ${days(gate.age_days)}`}
              right={
                gate.reopened_count > 0 ? (
                  <Badge variant="destructive">Bounced {gate.reopened_count}×</Badge>
                ) : (
                  <Badge variant="secondary">{days(gate.age_days)}</Badge>
                )
              }
            />
          ))}
        </ListCard>

        <ListCard
          title="Payments being chased"
          subtitle="Tasks a gate sent back for an outstanding payment"
          count={data.bounces.length}
          empty="No payment has bounced."
        >
          {data.bounces.map((row) => (
            <ListRow
              key={row.id}
              to={`/leads/${row.lead}`}
              title={
                <>
                  <span className="font-medium tabular-nums">{row.project_id || '—'}</span>
                  {' · '}
                  {row.company_name}
                </>
              }
              meta={`Task ${row.task_no}. ${row.task_name} · sent back by ${row.gate}`}
              right={
                <Badge variant={row.status === 'open' ? 'destructive' : 'secondary'}>
                  {row.reopened_count}× {row.status === 'open' ? 'chasing' : 'resolved'}
                </Badge>
              }
            />
          ))}
        </ListCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Recognized fees are the fixed + variable amounts recorded when an Implementation or Extension
        cycle closed. The system holds no forecast or pipeline value, so nothing here projects
        forward.
      </p>
    </div>
  )
}

export default FinanceDashboard
