import { KeyRound, ShieldOff, UserCheck, UserCog } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BeltBadge, RoleBadge } from '@/components/shared/StatusBadge'
import {
  BarChart,
  ChartCard,
  ChartTable,
  ColumnChart,
  StatTile,
  seriesColor,
  statusColor,
} from '@/components/charts'
import { formatDate } from '@/lib/format'
import { DashboardHeader, ListCard, ListRow, ViewAllButton } from './shared'

// User-management analytics: the shape of the org, and the accounts that need
// looking at. Reports over the same population as the Users screen (no
// superusers, no User-Management holders), so the two never disagree.
export function UserManagementDashboard({ data }) {
  const t = data.totals

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="User analytics"
        subtitle="Who has access, what they can do, and which accounts need attention."
        actions={<ViewAllButton to="/users">Manage users</ViewAllButton>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Users" value={t.total} hint={`${t.joined_this_month} joined this month`} icon={UserCog} />
        <StatTile label="Active" value={t.active} hint={`${t.inactive} deactivated`} icon={UserCheck} />
        {/* Belt-less users can't be picked for a resource slot, so this is the
            gap that actually blocks work. (A "never signed in" figure would be
            meaningless — `last_login` is never written under JWT auth.) */}
        <StatTile
          label="No belt assigned"
          value={t.no_belt}
          hint="Not selectable for resource allocation"
          icon={KeyRound}
          tone={t.no_belt > 0 ? 'var(--chart-status-hold)' : undefined}
        />
        <StatTile
          label="No role beyond Employee"
          value={data.attention.no_role.length}
          hint="Can sign in, but own no module"
          icon={ShieldOff}
          tone={data.attention.no_role.length > 0 ? 'var(--chart-status-hold)' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="By role"
          subtitle="Roles are many-to-many, so these overlap — everyone also holds Employee"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Role', render: (r) => <RoleBadge role={r.label} /> },
                { key: 'count', label: 'Users', align: 'right' },
              ]}
              rows={data.by_role}
            />
          }
        >
          <BarChart rows={data.by_role} colorFor={(_, i) => seriesColor(i)} emptyMessage="No roles assigned." />
        </ChartCard>

        <ChartCard
          title="By belt"
          subtitle="The pool resource allocation draws from"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Belt', render: (r) => <BeltBadge belt={r.label} /> },
                { key: 'count', label: 'Users', align: 'right' },
              ]}
              rows={data.by_belt}
            />
          }
        >
          <BarChart rows={data.by_belt} emptyMessage="No belts assigned." />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Joining trend"
          subtitle="Users by date of joining — last 12 months"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Month' },
                { key: 'joined', label: 'Joined', align: 'right' },
              ]}
              rows={data.joining_trend}
            />
          }
        >
          <ColumnChart
            rows={data.joining_trend}
            series={[{ key: 'joined', label: 'Joined', color: statusColor('In Progress') }]}
            emptyMessage="Nobody joined in the last year."
          />
        </ChartCard>

        <ChartCard
          title="By domain"
          subtitle="Competency area"
          table={
            <ChartTable
              columns={[
                { key: 'label', label: 'Domain' },
                { key: 'count', label: 'Users', align: 'right' },
              ]}
              rows={data.by_domain}
            />
          }
        >
          <BarChart rows={data.by_domain} emptyMessage="No domains assigned." />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Recently added"
          count={data.recent.length}
          action={<ViewAllButton to="/users">All users</ViewAllButton>}
          empty="No users yet."
        >
          {data.recent.map((u) => (
            <ListRow
              key={u.id}
              to="/users"
              title={u.name}
              meta={`${u.email} · joined ${formatDate(u.date_of_joining)}`}
              right={u.roles.filter((r) => r !== 'Employee').slice(0, 2).map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            />
          ))}
        </ListCard>

        <ListCard
          title="Needs attention"
          subtitle="Deactivated accounts, users with no role of their own, and users with no belt"
          count={
            data.attention.inactive.length
            + data.attention.no_role.length
            + data.attention.no_belt.length
          }
          empty="Every account looks healthy. 🎉"
        >
          {data.attention.inactive.map((u) => (
            <ListRow
              key={`inactive-${u.id}`}
              to="/users"
              title={u.name}
              meta={u.email}
              right={<Badge variant="secondary">Deactivated</Badge>}
            />
          ))}
          {data.attention.no_role.map((u) => (
            <ListRow
              key={`norole-${u.id}`}
              to="/users"
              title={u.name}
              meta={`${u.email} · Employee only`}
              right={<Badge variant="outline">No role</Badge>}
            />
          ))}
          {data.attention.no_belt.map((u) => (
            <ListRow
              key={`nobelt-${u.id}`}
              to="/users"
              title={u.name}
              meta={`${u.email} · not allocatable`}
              right={<Badge variant="outline">No belt</Badge>}
            />
          ))}
        </ListCard>
      </div>
    </div>
  )
}

export default UserManagementDashboard
