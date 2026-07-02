import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLeads } from '@/hooks/useLeads'
import { useProjects } from '@/hooks/useProjects'
import { useUsers } from '@/hooks/useUsers'
import { useLeadTypes } from '@/hooks/useLeadTypes'
import { useAuth } from '@/context/AuthContext'
import { formatCompactCurrency } from '@/lib/format'

function ChartCard({ title, data, dataKey = 'value', formatter = formatCompactCurrency }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => formatter(v)} fontSize={11} />
            <YAxis type="category" dataKey="name" width={110} fontSize={12} />
            <Tooltip formatter={(v) => formatter(v)} />
            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} fill="var(--color-primary, #6366f1)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export default function Reports() {
  const { user } = useAuth()
  const { data: leads = [] } = useLeads()
  const { data: projects = [] } = useProjects()
  const { data: users = [] } = useUsers()
  const { data: leadTypes = [] } = useLeadTypes()

  const closedWon = leads.filter((l) => l.status === 'Closed Won').length
  const closedLost = leads.filter((l) => l.status === 'Closed Lost').length
  const winRate = closedWon + closedLost > 0 ? Math.round((closedWon / (closedWon + closedLost)) * 100) : 0

  const valueByOwner = useMemo(() => {
    const map = {}
    for (const l of leads) {
      if (l.status.startsWith('Closed')) continue
      map[l.owner_id] = (map[l.owner_id] || 0) + (l.acv || 0)
    }
    return Object.entries(map).map(([ownerId, value]) => ({ name: users.find((u) => u.id === ownerId)?.name || 'Unknown', value }))
  }, [leads, users])

  const valueByType = useMemo(() => {
    const map = {}
    for (const l of leads) {
      if (l.status.startsWith('Closed')) continue
      map[l.lead_type_id] = (map[l.lead_type_id] || 0) + (l.acv || 0)
    }
    return Object.entries(map).map(([typeId, value]) => ({ name: leadTypes.find((t) => t.id === typeId)?.name || 'Unknown', value }))
  }, [leads, leadTypes])

  const repWorkload = useMemo(() => {
    const map = {}
    for (const p of projects) {
      if (p.status === 'Completed' || p.status === 'Cancelled') continue
      map[p.assigned_to] = (map[p.assigned_to] || 0) + 1
    }
    return Object.entries(map).map(([repId, value]) => ({ name: users.find((u) => u.id === repId)?.name || 'Unassigned', value }))
  }, [projects, users])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === 'Admin' ? 'Company-wide analytics.' : user.role === 'Manager' ? 'Analytics for your leads.' : 'Your own performance.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Win rate</p><p className="text-2xl font-semibold">{winRate}%</p><p className="text-xs text-muted-foreground">{closedWon} won · {closedLost} lost</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open leads</p><p className="text-2xl font-semibold">{leads.filter((l) => !l.status.startsWith('Closed')).length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active projects</p><p className="text-2xl font-semibold">{projects.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled').length}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {user.role !== 'Representative' && <ChartCard title="Open pipeline value by owner" data={valueByOwner} />}
        <ChartCard title="Open pipeline value by lead type" data={valueByType} />
        {user.role !== 'Representative' && (
          <ChartCard title="Rep workload (active projects)" data={repWorkload} formatter={(v) => v} />
        )}
      </div>
    </div>
  )
}
