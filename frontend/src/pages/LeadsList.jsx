import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, PauseCircle, FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { useLeads } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'
import { cn } from '@/lib/utils'

// Tracker bar colour follows lead status (§5.18 / Tech Req §4.3.3 v16):
// green while moving (or done), amber when paused, red when dropped.
const STATUS_BAR_COLORS = {
  'In Progress': 'bg-emerald-500',
  Hybernation: 'bg-emerald-500',
  Complete: 'bg-emerald-700',
  'On Hold': 'bg-amber-500',
  Dropped: 'bg-red-500',
}

const EMPTY_FILTERS = {
  text: '',
  projectId: '',
  industry: 'all',
  domain: 'all',
  owner: 'all',
  currentTask: 'all',
  status: 'all',
}

// Workflow progress driven by task closure: closed/total real instances + %
// (skipped steps excluded server-side; repeat cycles add instances).
function TrackerBar({ lead }) {
  const tp = lead.task_progress
  if (!tp || tp.total === 0) {
    return <span className="text-xs text-muted-foreground">Not started</span>
  }
  const color = STATUS_BAR_COLORS[lead.status] || 'bg-emerald-500'
  return (
    <div className="min-w-28">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(tp.percent, 100)}%` }} />
      </div>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {tp.closed}/{tp.total} · {tp.percent}%
      </p>
    </div>
  )
}

// A dropdown filter cell whose options come from the data on screen (§5.18).
function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function LeadsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const { data: leads = [], isLoading } = useLeads()

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  // Dropdown options are built from the loaded rows (§5.18) — Owner includes
  // "Not Assigned"; Current Task is sorted numerically by task number.
  const options = useMemo(() => {
    const uniq = (vals) => [...new Set(vals.filter(Boolean))].sort()
    const owners = uniq(leads.map((l) => l.assigned_to_name))
    if (leads.some((l) => !l.assigned_to)) owners.unshift('Not Assigned')
    const taskMap = new Map()
    for (const l of leads) {
      if (l.current_task) taskMap.set(l.current_task.task_no, l.current_task.task_name)
    }
    const currentTasks = [...taskMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([no, name]) => ({ value: String(no), label: `Task ${no}. ${name}` }))
    const asOpts = (vals) => vals.map((v) => ({ value: v, label: v }))
    return {
      industries: asOpts(uniq(leads.map((l) => l.industry_name))),
      domains: asOpts(uniq(leads.map((l) => l.domain_name))),
      owners: asOpts(owners),
      currentTasks,
      statuses: asOpts(uniq(leads.map((l) => l.status))),
    }
  }, [leads])

  // All filters combine with AND semantics (§5.18).
  const rows = useMemo(() => {
    const text = filters.text.trim().toLowerCase()
    const pid = filters.projectId.trim().toLowerCase()
    return leads
      .filter((l) => {
        if (text && !`${l.company_name} ${l.project_name}`.toLowerCase().includes(text)) return false
        if (pid && !(l.project_id || '').toLowerCase().includes(pid)) return false
        if (filters.industry !== 'all' && l.industry_name !== filters.industry) return false
        if (filters.domain !== 'all' && l.domain_name !== filters.domain) return false
        if (filters.owner !== 'all') {
          const owner = l.assigned_to_name || 'Not Assigned'
          if (owner !== filters.owner) return false
        }
        if (filters.currentTask !== 'all' && String(l.current_task?.task_no ?? '') !== filters.currentTask) return false
        if (filters.status !== 'all' && l.status !== filters.status) return false
        return true
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [leads, filters])

  const columnCount = 9

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {hasRole(user, 'Lead Admin') ? 'All leads across the company.' : hasRole(user, 'Lead Manager') ? 'Leads you own or are assigned to.' : 'Leads you created.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              <FilterX className="size-4" /> Clear filters
            </Button>
          )}
          {PERMISSIONS.createLead(user) && (
            <Button onClick={() => navigate('/leads/new')}>
              <Plus className="size-4" /> New lead
            </Button>
          )}
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Company / Project</TableHead>
                <TableHead>Project ID</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Current Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tracker</TableHead>
              </TableRow>
              {/* Per-column filter row (§5.18): free text for Company/Project +
                  Project ID, dropdowns (built from the loaded data) for the
                  rest. All filters combine with AND. */}
              <TableRow className="hover:bg-transparent">
                <TableHead />
                <TableHead className="py-1.5">
                  <Input value={filters.text} onChange={(e) => setFilter('text')(e.target.value)} placeholder="Search…" className="h-8 text-xs" />
                </TableHead>
                <TableHead className="py-1.5">
                  <Input value={filters.projectId} onChange={(e) => setFilter('projectId')(e.target.value)} placeholder="Search…" className="h-8 text-xs" />
                </TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.industry} onChange={setFilter('industry')} options={options.industries} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.domain} onChange={setFilter('domain')} options={options.domains} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.owner} onChange={setFilter('owner')} options={options.owners} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.currentTask} onChange={setFilter('currentTask')} options={options.currentTasks} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.status} onChange={setFilter('status')} options={options.statuses} placeholder="All" /></TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No leads match the filters.</TableCell></TableRow>
              )}
              {rows.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell className="font-medium tabular-nums text-muted-foreground">{lead.lead_display_id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {lead.project_name}
                      </Link>
                      <LeadTypeBadge type={lead.lead_type} />
                    </div>
                    <div className="text-xs text-muted-foreground">{lead.company_name || '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{lead.project_id || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{lead.industry_name || '—'}</TableCell>
                  <TableCell>{lead.domain_name || '—'}</TableCell>
                  <TableCell className="text-sm">{lead.assigned_to_name || <span className="text-muted-foreground">Not Assigned</span>}</TableCell>
                  <TableCell className="text-sm">
                    {lead.current_task
                      ? `${lead.current_task.task_no}. ${lead.current_task.task_name}`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <LeadStatusBadge status={lead.status} />
                      {lead.has_held_task && lead.status !== 'On Hold' && (
                        <span
                          title="A task under this lead is on hold"
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <PauseCircle className="size-3" /> Task on hold
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><TrackerBar lead={lead} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
