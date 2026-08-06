import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, PauseCircle, Info, FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, LeadTypeBadge, StageBadge, stageLabel } from '@/components/shared/StatusBadge'
import Pagination from '@/components/shared/Pagination'
import { useLeadFilterOptions, useLeadsPage } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'
import { personName } from '@/lib/format'
import { cn } from '@/lib/utils'

// Tracker bar colour follows lead status (§5.18 / Tech Req §4.3.3 v16):
// green while moving (or done), amber when paused, red when dropped.
const STATUS_BAR_COLORS = {
  'In Progress': 'bg-emerald-500',
  Completed: 'bg-emerald-700',
  Hold: 'bg-amber-500',
  Dropped: 'bg-red-500',
}

const EMPTY_FILTERS = {
  text: '',
  projectId: '',
  industry: 'all',
  domain: 'all',
  owner: 'all',
  currentStage: 'all',
  currentTask: 'all',
  status: 'all',
}

const DEFAULT_PAGE_SIZE = 50
// Long enough that a fast typist doesn't fire a request per keystroke, short
// enough that the table still feels like it is reacting to the search box.
const TEXT_DEBOUNCE_MS = 300

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

// What the listing means for the signed-in role — it is the same screen but a
// server-scoped set of rows (see `lead_scope_q`). Checked most-global first; the
// Resource Manager (R10-1) sees every lead that has reached an allocation task,
// read-only, so they can open its stepper and staff the slots.
function leadsSubtitle(user) {
  if (hasRole(user, 'Lead Admin')) return 'All leads across the company.'
  if (hasRole(user, 'Lead Manager')) return 'Leads you own or are assigned to.'
  if (hasRole(user, 'Marketing')) return 'Leads you created.'
  if (hasRole(user, 'Resource Manager')) return 'Leads that have reached a resource-allocation step.'
  return 'Leads you are working on.'
}

// A dropdown filter cell. Options come from `/api/leads/filter-options/` — the
// whole scoped dataset, **not** the rows on this page (R25): building them from
// the visible rows is what makes a filter useless the moment the data pages.
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

// --- URL <-> state -----------------------------------------------------------
// Filters, page and page size live in the query string so the filtered page
// survives a refresh and, more importantly, comes back when the user opens a
// lead and presses Back — this table is a launch pad for the detail screen, and
// losing a search on every return trip is the main reason people stop filtering.
function readFilters(params) {
  const out = { ...EMPTY_FILTERS }
  for (const key of Object.keys(EMPTY_FILTERS)) {
    const raw = params.get(key)
    if (raw !== null && raw !== '') out[key] = raw
  }
  return out
}

function writeParams({ filters, page, pageSize }) {
  const params = {}
  for (const [key, value] of Object.entries(filters)) {
    if (value !== EMPTY_FILTERS[key]) params[key] = value
  }
  if (page > 1) params.page = String(page)
  if (pageSize !== DEFAULT_PAGE_SIZE) params.pageSize = String(pageSize)
  return params
}

export default function LeadsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE

  const update = useCallback(
    (next) => {
      setSearchParams(
        writeParams({ filters, page, pageSize, ...next }),
        { replace: true },
      )
    },
    [filters, page, pageSize, setSearchParams],
  )

  // Any filter change goes back to page 1: staying on page 7 of a set that just
  // shrank to two pages shows an empty table over a full result set.
  const setFilter = (key) => (value) =>
    update({ filters: { ...filters, [key]: value }, page: 1 })

  // The two text boxes are typed into, so they keep their own immediate state
  // and only push into the URL (and the request) after a pause.
  const [textDraft, setTextDraft] = useState(filters.text)
  const [projectIdDraft, setProjectIdDraft] = useState(filters.projectId)
  useEffect(() => setTextDraft(filters.text), [filters.text])
  useEffect(() => setProjectIdDraft(filters.projectId), [filters.projectId])
  useEffect(() => {
    if (textDraft === filters.text && projectIdDraft === filters.projectId) return
    const t = setTimeout(
      () => update({ filters: { ...filters, text: textDraft, projectId: projectIdDraft }, page: 1 }),
      TEXT_DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [textDraft, projectIdDraft, filters, update])

  const { data, isLoading, isFetching, isPlaceholderData } = useLeadsPage({ page, pageSize, filters })
  const { data: rawOptions } = useLeadFilterOptions()

  const rows = data?.rows ?? []
  const count = data?.count ?? 0
  const pageCount = data?.pageCount ?? 1

  // A page beyond the end (a bookmarked page 9 of a set that has shrunk, or a
  // filter that narrowed while a later page was open) snaps back to the last one
  // that exists rather than showing an empty table.
  useEffect(() => {
    if (!data || isPlaceholderData) return
    if (page > pageCount) update({ page: pageCount })
  }, [data, isPlaceholderData, page, pageCount, update])

  const options = useMemo(() => {
    const o = rawOptions || {}
    const asOpts = (vals) => (vals || []).map((v) => ({ value: v, label: v }))
    const owners = (o.owners || []).map((r) => ({
      // The signed-in user reads as "Me" here too, matching the Owner column;
      // the option's *value* stays the id, which is what the server filters on.
      value: String(r.value),
      label: personName(r.label, user, { id: r.value, capitalize: true }),
    }))
    if (o.has_unassigned) owners.unshift({ value: 'unassigned', label: 'Not Assigned' })
    return {
      industries: (o.industries || []).map((r) => ({ value: String(r.value), label: r.label })),
      domains: (o.domains || []).map((r) => ({ value: String(r.value), label: r.label })),
      owners,
      // Current-Stage options (§4.3.3): the derived stage code on each lead
      // (R2's `current_stage`), labelled the same way the StageBadge/stepper do.
      stages: (o.stages || []).map((code) => ({ value: code, label: stageLabel(code) })),
      currentTasks: (o.current_tasks || []).map((r) => ({
        value: String(r.value),
        label: `Task ${r.value}. ${r.label}`,
      })),
      statuses: asOpts(o.statuses),
    }
  }, [rawOptions, user])

  const filtersActive = Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== EMPTY_FILTERS[k])
  const clearFilters = () => update({ filters: EMPTY_FILTERS, page: 1 })

  const columnCount = 10

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">{leadsSubtitle(user)}</p>
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="outline" onClick={clearFilters}>
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
        {/* The filter row states what it searches, because with pagination the
            distinction matters: it is the whole dataset, not this page. */}
        {filtersActive && (
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            Filtering all {count === 1 ? '1 lead' : `${count.toLocaleString()} leads`} matched across every page.
          </div>
        )}
        <CardContent className={cn('overflow-x-auto p-0', isFetching && 'opacity-60 transition-opacity')}>
          <Table>
            <TableHeader>
              <TableRow>
                {/* `#` is the row's serial number, so it sits in the first
                    column (user, 2026-07-30); the Project ID — the lead's real
                    identifier (R9-1) — follows it. */}
                <TableHead>#</TableHead>
                <TableHead>Project ID</TableHead>
                <TableHead>Company / Project</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Current Stage</TableHead>
                <TableHead>Current Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tracker</TableHead>
              </TableRow>
              {/* Per-column filter row (§5.18): free text for Company/Project +
                  Project ID, dropdowns for the rest. All filters combine with
                  AND and are applied **server-side, across every page** (R25). */}
              <TableRow className="hover:bg-transparent">
                <TableHead />
                <TableHead className="py-1.5">
                  <Input value={projectIdDraft} onChange={(e) => setProjectIdDraft(e.target.value)} placeholder="Search…" className="h-8 text-xs" />
                </TableHead>
                <TableHead className="py-1.5">
                  <Input value={textDraft} onChange={(e) => setTextDraft(e.target.value)} placeholder="Search…" className="h-8 text-xs" />
                </TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.industry} onChange={setFilter('industry')} options={options.industries} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.domain} onChange={setFilter('domain')} options={options.domains} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.owner} onChange={setFilter('owner')} options={options.owners} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.currentStage} onChange={setFilter('currentStage')} options={options.stages} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.currentTask} onChange={setFilter('currentTask')} options={options.currentTasks} placeholder="All" /></TableHead>
                <TableHead className="py-1.5"><FilterSelect value={filters.status} onChange={setFilter('status')} options={options.statuses} placeholder="All" /></TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">
                  {filtersActive ? 'No leads match the filters.' : 'No leads yet.'}
                </TableCell></TableRow>
              )}
              {rows.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell className="tabular-nums text-muted-foreground">{lead.id}</TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {lead.project_id_display || <span className="font-normal text-muted-foreground">Pending</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {lead.project_name}
                      </Link>
                      <LeadTypeBadge type={lead.lead_type} />
                    </div>
                    <div className="text-xs text-muted-foreground">{lead.company_name || '—'}</div>
                  </TableCell>
                  <TableCell>{lead.industry_name || '—'}</TableCell>
                  <TableCell>{lead.domain_name || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {personName(lead.assigned_to_name, user, { id: lead.assigned_to, capitalize: true })
                      || <span className="text-muted-foreground">Not Assigned</span>}
                  </TableCell>
                  <TableCell>
                    {lead.current_stage?.stage ? <StageBadge stage={lead.current_stage.stage} /> : <span className="text-sm text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.current_task
                      ? `${lead.current_task.task_no}. ${lead.current_task.task_name}`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <LeadStatusBadge status={lead.status} />
                      {lead.has_held_task && lead.status !== 'Hold' && (
                        <span
                          title="A task under this lead is on hold"
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <PauseCircle className="size-3" /> Task on hold
                        </span>
                      )}
                      {lead.short_close_info && (
                        <span
                          title={`Short-closed${lead.short_close_info.short_closed_by_name ? ` by ${lead.short_close_info.short_closed_by_name}` : ''}`}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        >
                          <Info className="size-3" /> Short-closed
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
        {!isLoading && count > 0 && (
          <Pagination
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            pageSize={pageSize}
            count={count}
            label="leads"
            onPageChange={(n) => update({ page: n })}
            // Changing the page size changes what "page 3" means, so it restarts
            // at page 1 instead of landing somewhere unrelated.
            onPageSizeChange={(n) => update({ pageSize: n, page: 1 })}
          />
        )}
      </Card>
    </div>
  )
}
