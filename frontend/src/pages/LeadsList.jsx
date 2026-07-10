import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { useLeads } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'

// User-settable + system statuses shown in the filter (Tech Req §4.3.2).
const LEAD_STATUSES = ['In Progress', 'On Hold', 'Dropped', 'Hybernation', 'Complete']

export default function LeadsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')

  const { data: leads = [], isLoading } = useLeads({ q, status: status === 'all' ? undefined : status })

  const sorted = useMemo(
    () => [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [leads],
  )
  const columnCount = 7

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {hasRole(user, 'Lead Admin') ? 'All leads across the company.' : hasRole(user, 'Lead Manager') ? 'Leads you own or are assigned to.' : 'Leads you created.'}
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
            <Input placeholder="Search project, company, or industry…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No leads match your filters.</TableCell></TableRow>
              )}
              {sorted.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell>
                    <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {lead.project_name}
                    </Link>
                  </TableCell>
                  <TableCell>{lead.company_name || '—'}</TableCell>
                  <TableCell>{lead.country_name || '—'}</TableCell>
                  <TableCell>{lead.industry_name || '—'}</TableCell>
                  <TableCell><LeadTypeBadge type={lead.lead_type} /></TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-sm">{lead.assigned_to_name || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
