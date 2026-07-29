import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AllocationStatusBadge, StageBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/format'
import { useResourceAllocations } from '@/hooks/useResources'

// Resource-history dashboard (Tech Req §4.7, §9.1 / PRD §5.7): days worked per
// resource, across every slot/stage/lead they've ever held, incl. the full
// reassignment chain a slot went through. Powered by the same append-only
// `/api/resource-allocations/` rows the Resources screen's history uses — each
// row already carries `days_worked` + `replaces`/`replaced_by_id`, so no
// separate aggregation endpoint is needed.
export default function ResourceHistory() {
  const { data: rows = [], isLoading } = useResourceAllocations()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set())

  const byUser = useMemo(() => {
    const groups = new Map()
    for (const r of rows) {
      // R14-1: legacy "TBD" rows name nobody, so there is no resource to credit
      // the days to — they used to appear here as a person called "TBD".
      if (r.is_tbd) continue
      const key = r.user_name?.id ?? 'unknown'
      const label = r.user_name?.name || 'Unknown'
      if (!groups.has(key)) groups.set(key, { key, name: label, rows: [], totalDays: 0, leads: new Set() })
      const g = groups.get(key)
      g.rows.push(r)
      g.totalDays += r.days_worked || 0
      g.leads.add(r.lead)
    }
    return [...groups.values()].sort((a, b) => b.totalDays - a.totalDays)
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return byUser
    return byUser.filter((g) => (
      g.name.toLowerCase().includes(q)
      || g.rows.some((r) => r.lead_project_name?.toLowerCase().includes(q) || r.lead_company_name?.toLowerCase().includes(q))
    ))
  }, [byUser, query])

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resource History</h1>
        <p className="text-sm text-muted-foreground">
          Days worked per resource, by slot and stage, across every lead — including how each slot's
          allocation was reassigned over time.
        </p>
      </div>

      <Input
        placeholder="Search by resource, company, or project…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Resource</TableHead>
                <TableHead>Leads worked</TableHead>
                <TableHead>Allocation rows</TableHead>
                <TableHead className="text-right">Total days worked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No allocation history yet.</TableCell></TableRow>
              )}
              {filtered.map((g) => {
                const isOpen = expanded.has(g.key)
                return (
                  <RowGroup key={g.key} group={g} isOpen={isOpen} onToggle={() => toggle(g.key)} allRows={rows} />
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function RowGroup({ group, isOpen, onToggle, allRows }) {
  const byId = useMemo(() => new Map(allRows.map((r) => [r.id, r])), [allRows])
  const sortedRows = [...group.rows].sort((a, b) => new Date(b.allocated_on) - new Date(a.allocated_on))
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell><ChevronRight className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} /></TableCell>
        <TableCell><UserChip user={group.name !== 'Unknown' ? { name: group.name } : null} /></TableCell>
        <TableCell className="text-muted-foreground">{group.leads.size}</TableCell>
        <TableCell className="text-muted-foreground">{group.rows.length}</TableCell>
        <TableCell className="text-right font-medium tabular-nums">{group.totalDays.toFixed(1)}</TableCell>
      </TableRow>
      {isOpen && sortedRows.map((r) => (
        <TableRow key={r.id} className="bg-muted/30">
          <TableCell />
          <TableCell colSpan={4}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-sm">
              {/* R13-1: the role has its lead page back, so the project name
                  links to it again (DD-R12-4's plain label reverted); the Project
                  ID + stage still identify the engagement on their own. */}
              <Link to={`/leads/${r.lead}`} className="font-medium hover:underline">
                {r.lead_project_name}
              </Link>
              <span className="text-muted-foreground tabular-nums">{r.project_id || r.lead_project_id}</span>
              <span className="text-muted-foreground">{r.lead_company_name}</span>
              <StageBadge stage={r.stage_code} />
              <span className="text-muted-foreground">{r.slot_label}</span>
              <AllocationStatusBadge status={r.status} />
              <span className="text-muted-foreground">
                {formatDate(r.allocated_on)} – {r.released_on ? formatDate(r.released_on) : 'now'}
              </span>
              <span className="tabular-nums font-medium">{(r.days_worked || 0).toFixed(1)} days</span>
              {r.replaces && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3" /> replaced {byId.get(r.replaces)?.user_name?.name || `row #${r.replaces}`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>This allocation is a reassignment of an earlier one</TooltipContent>
                </Tooltip>
              )}
              {r.replaced_by_id && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="size-3" /> replaced by {byId.get(r.replaced_by_id)?.user_name?.name || `row #${r.replaced_by_id}`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>This allocation was later reassigned to someone else</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
