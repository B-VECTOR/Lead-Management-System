import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, PriorityBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { useLeads } from '@/hooks/useLeads'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { useLeadTypes } from '@/hooks/useLeadTypes'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'
import { LEAD_STATUSES } from '@/mocks/seed'
import { leadProgress, getLeadStageInfo } from '@/api/checklist'
import { getLeadCommentPreview } from '@/api/followups'

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'target_date_asc', label: 'Target date soonest' },
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
  const { data: leadTypes = [] } = useLeadTypes()

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const leadTypeById = useMemo(() => Object.fromEntries(leadTypes.map((t) => [t.id, t])), [leadTypes])
  const showCommentPreview = PERMISSIONS.viewFollowupPreview(user)
  const columnCount = showCommentPreview ? 9 : 8

  const sorted = useMemo(() => {
    const rows = [...leads]
    switch (sort) {
      case 'target_date_asc': return rows.sort((a, b) => new Date(a.target_date || '9999') - new Date(b.target_date || '9999'))
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
            {hasRole(user, 'Lead Admin') ? 'All leads across the company.' : hasRole(user, 'Lead Manager') ? 'Leads you own.' : 'Leads assigned to you.'}
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
            <Input placeholder="Search project name, Lead ID, company, or industry…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
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
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Progress</TableHead>
                {showCommentPreview && <TableHead>Comments</TableHead>}
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No leads match your filters.</TableCell></TableRow>
              )}
              {sorted.map((lead) => {
                const stage = getLeadStageInfo(lead.id)
                const preview = showCommentPreview ? getLeadCommentPreview(lead.id) : null
                return (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell>
                    <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {lead.name || lead.code}
                    </Link>
                    <p className="text-xs text-muted-foreground">{lead.code}</p>
                  </TableCell>
                  <TableCell>{companyById[lead.company_id]?.name || '—'}</TableCell>
                  <TableCell>{leadTypeById[lead.lead_type_id] && <LeadTypeBadge type={leadTypeById[lead.lead_type_id].name} />}</TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell><PriorityBadge priority={lead.priority} /></TableCell>
                  <TableCell><UserChip user={userById[lead.assigned_to]} /></TableCell>
                  <TableCell><ProgressBar value={leadProgress(lead.id)} /></TableCell>
                  {showCommentPreview && (
                    <TableCell className="max-w-56 text-xs text-muted-foreground">
                      {!preview && '—'}
                      {preview && (
                        <div className="flex flex-col gap-1">
                          <p className="truncate"><span className="font-medium text-foreground">First:</span> {userById[preview.first.author_id]?.name} — {preview.first.comment}</p>
                          {preview.last.id !== preview.first.id && (
                            <p className="truncate"><span className="font-medium text-foreground">Last:</span> {userById[preview.last.author_id]?.name} — {preview.last.comment}</p>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{stage.stepName}</Badge>
                      {stage.isStuck && <Badge variant="destructive">Stuck</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
