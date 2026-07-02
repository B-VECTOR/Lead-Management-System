import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, PriorityBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { useLeads } from '@/hooks/useLeads'
import { useProjects } from '@/hooks/useProjects'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { LEAD_STATUSES } from '@/mocks/seed'
import { formatCompactCurrency, formatDate } from '@/lib/format'

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'acv_desc', label: 'Value: high to low' },
  { value: 'close_asc', label: 'Closing soonest' },
  { value: 'follow_up_asc', label: 'Next follow-up' },
]

export default function LeadsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('created_desc')

  const { data: leads = [], isLoading } = useLeads({ q, status: status === 'all' ? undefined : status })
  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()
  const { data: projects = [] } = useProjects()

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const firstProjectByLead = useMemo(() => {
    const map = {}
    for (const p of projects) if (!map[p.lead_id]) map[p.lead_id] = p
    return map
  }, [projects])

  const sorted = useMemo(() => {
    const rows = [...leads]
    switch (sort) {
      case 'acv_desc': return rows.sort((a, b) => (b.acv || 0) - (a.acv || 0))
      case 'close_asc': return rows.sort((a, b) => new Date(a.expected_close_date || 0) - new Date(b.expected_close_date || 0))
      case 'follow_up_asc': return rows.sort((a, b) => new Date(a.next_follow_up || '9999') - new Date(b.next_follow_up || '9999'))
      default: return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }
  }, [leads, sort])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === 'Representative' ? 'Leads with work assigned to you.' : user.role === 'Manager' ? 'Leads you own.' : 'All leads across the company.'}
          </p>
        </div>
        {PERMISSIONS.createLead(user) && (
          <Button onClick={() => navigate('/leads/new')}>
            <Plus className="size-4" /> New lead
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search Lead ID, company, or industry…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">ACV</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Next follow-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No leads match your filters.</TableCell></TableRow>
              )}
              {sorted.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell>
                    <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{lead.code}</Link>
                    <p className="text-xs text-muted-foreground">{firstProjectByLead[lead.id]?.name || 'No project yet'}</p>
                  </TableCell>
                  <TableCell>{companyById[lead.company_id]?.name || '—'}</TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell><PriorityBadge priority={lead.priority} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCompactCurrency(lead.acv, lead.currency)}</TableCell>
                  <TableCell><UserChip user={userById[lead.owner_id]} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(lead.next_follow_up)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
