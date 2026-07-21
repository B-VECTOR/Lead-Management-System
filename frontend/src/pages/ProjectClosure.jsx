import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectClosureStatusBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProjectClosure, useShortCloseProject } from '@/hooks/useResources'
import { cn } from '@/lib/utils'

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

// Resource Manager Project Closure screen (Tech Req §9.2 / PRD §5.12) — one row
// per project (grouped by lead), expandable to reveal its past extension cycles.
// Short-close acts only on the current cycle and opens the Project Closure task.
export default function ProjectClosure() {
  const { data: rows = [], isLoading } = useProjectClosure()
  const shortClose = useShortCloseProject()
  const [expanded, setExpanded] = useState(() => new Set())

  const projects = useMemo(() => {
    const groups = new Map()
    for (const r of rows) {
      if (!groups.has(r.lead)) groups.set(r.lead, [])
      groups.get(r.lead).push(r)
    }
    return [...groups.values()]
      .map((cycles) => {
        const current = cycles.find((c) => c.is_current) || cycles[0]
        const history = cycles
          .filter((c) => c.id !== current.id)
          .sort((a, b) => b.extension_no.localeCompare(a.extension_no))
        return { key: current.lead, current, history }
      })
      .sort((a, b) => new Date(b.current.generated_at) - new Date(a.current.generated_at))
  }, [rows])

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleShortClose(id) {
    shortClose.mutate(
      { id },
      {
        onSuccess: () => toast.success('Project closure task opened'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Project Closure</h1>
        <p className="text-sm text-muted-foreground">One row per project. Expand a row to see its past extension cycles. Short-closing the current cycle opens its Project Closure task.</p>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Project No</TableHead>
                <TableHead>Ext</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Company / Project</TableHead>
                <TableHead>Lead Manager</TableHead>
                <TableHead>Exec Red</TableHead>
                <TableHead>Exec Brown</TableHead>
                <TableHead>White(s)</TableHead>
                <TableHead className="text-right">Fixed Fee</TableHead>
                <TableHead className="text-right">Variable Fee</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && projects.length === 0 && (
                <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">No projects yet. A cycle appears once an Implementation task closes.</TableCell></TableRow>
              )}
              {projects.map(({ key, current, history }) => {
                const isOpen = expanded.has(key)
                const hasHistory = history.length > 0
                return (
                  <Fragment key={key}>
                    <TableRow className={cn(hasHistory && 'cursor-pointer')} onClick={hasHistory ? () => toggle(key) : undefined}>
                      <TableCell>
                        {hasHistory && (
                          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{current.project_id}</TableCell>
                      <TableCell>{current.extension_no}</TableCell>
                      <TableCell><ProjectClosureStatusBadge status={current.status} /></TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{current.lead_company_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {current.lead_project_name}
                          {hasHistory && <span> · {history.length} earlier cycle{history.length > 1 ? 's' : ''}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{current.lead_manager?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{current.execution_red?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{current.execution_brown?.name || '—'}</TableCell>
                      <TableCell className="text-sm">{names(current.whites) || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{fmtFee(current.fixed_fee)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtFee(current.variable_fee)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {current.can_short_close ? (
                          <Button size="sm" variant="outline" disabled={shortClose.isPending} onClick={() => handleShortClose(current.id)}>
                            <XCircle className="size-4" /> Short-close
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && history.map((r) => (
                      <TableRow key={r.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell className="pl-6 font-mono text-xs text-muted-foreground">{r.project_id}</TableCell>
                        <TableCell className="text-muted-foreground">{r.extension_no}</TableCell>
                        <TableCell><ProjectClosureStatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.lead_project_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.lead_manager?.name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.execution_red?.name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.execution_brown?.name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{names(r.whites) || '—'}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtFee(r.fixed_fee)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmtFee(r.variable_fee)}</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
