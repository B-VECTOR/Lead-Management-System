import { Fragment, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectClosureStatusBadge, LeadTypeBadge, StageBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProjectClosure } from '@/hooks/useResources'

function fmtFee(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : String(v)
}

// Whites are multi-select on the allocation, so the cycle row carries a list.
function names(list) {
  if (!list || list.length === 0) return null
  return list.map((u) => u?.name).filter(Boolean).join(', ')
}

// Resource Manager Project Closure screen (Tech Req §9.2 / PRD §5.12, R6
// rebuild) — one row per completed Implementation/Extension-loop cycle,
// grouped by a project's `base_code` family so a Mining child's own cycles
// show up alongside its parent's (§13). Short-close itself is a lead-scoped
// action worked from the Lead Detail page (it fires *before* a cycle's row
// exists here — see LeadDetail's short-close button) rather than a per-row
// control on this now purely historical list.
export default function ProjectClosure() {
  const { data: rows = [], isLoading } = useProjectClosure()

  const groups = useMemo(() => {
    const byKey = new Map()
    for (const r of rows) {
      const key = r.lead_base_code || `lead-${r.lead}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(r)
    }
    return [...byKey.entries()]
      .map(([key, cycles]) => ({
        key,
        baseCode: cycles[0].lead_base_code,
        cycles: [...cycles].sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at)),
      }))
      .sort((a, b) => new Date(b.cycles.at(-1).generated_at) - new Date(a.cycles.at(-1).generated_at))
  }, [rows])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Project Closure</h1>
        <p className="text-sm text-muted-foreground">
          One row per completed cycle, grouped by project — implementation, every extension, and any mining cycle together. Short-close is worked from the lead's own page.
        </p>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project ID</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Company / Project</TableHead>
                <TableHead>Lead Manager</TableHead>
                <TableHead>Exec Red</TableHead>
                <TableHead>Exec Brown</TableHead>
                <TableHead>White(s)</TableHead>
                <TableHead className="text-right">Fixed Fee</TableHead>
                <TableHead className="text-right">Variable Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && groups.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">No projects yet. A cycle appears once an Implementation task closes.</TableCell></TableRow>
              )}
              {groups.map(({ key, baseCode, cycles }) => (
                <Fragment key={key}>
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={10} className="py-1.5 text-xs font-medium text-muted-foreground">
                      {baseCode || 'Project ID pending'} · {cycles[0].lead_company_name} — {cycles[0].lead_project_name}
                    </TableCell>
                  </TableRow>
                  {cycles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.project_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StageBadge stage={r.stage_code} />
                          {r.lead_type === 'Mining' && <LeadTypeBadge type={r.lead_type} />}
                        </div>
                      </TableCell>
                      <TableCell><ProjectClosureStatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.lead_project_name}</TableCell>
                      <TableCell className="text-sm">{r.lead_manager?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.execution_red?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.execution_brown?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{names(r.whites) || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{fmtFee(r.fixed_fee)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtFee(r.variable_fee)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
