import { useMemo } from 'react'
import { toast } from 'sonner'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProjectClosureStatusBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProjectClosure, useShortCloseProject } from '@/hooks/useResources'

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
// per project cycle (first-time implementation + every extension), each with
// its own Project No, extension number, and status. Short-close acts only on
// the current cycle and opens the Project Closure task.
export default function ProjectClosure() {
  const { data: rows = [], isLoading } = useProjectClosure()
  const shortClose = useShortCloseProject()

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at)),
    [rows],
  )

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
        <p className="text-sm text-muted-foreground">One row per project cycle. Short-closing the current cycle opens its Project Closure task.</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
              {isLoading && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">No projects yet. A cycle appears once an Implementation task closes.</TableCell></TableRow>
              )}
              {sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.project_id}</TableCell>
                  <TableCell>{r.extension_no}</TableCell>
                  <TableCell><ProjectClosureStatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{r.lead_company_name}</div>
                    <div className="text-xs text-muted-foreground">{r.lead_project_name}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.lead_manager?.name || '—'}</TableCell>
                  <TableCell className="text-sm">{r.execution_red?.name || '—'}</TableCell>
                  <TableCell className="text-sm">{r.execution_brown?.name || '—'}</TableCell>
                  <TableCell className="text-sm">{names(r.whites) || '—'}</TableCell>
                  <TableCell className="text-right text-sm">{fmtFee(r.fixed_fee)}</TableCell>
                  <TableCell className="text-right text-sm">{fmtFee(r.variable_fee)}</TableCell>
                  <TableCell className="text-right">
                    {r.can_short_close ? (
                      <Button size="sm" variant="outline" disabled={shortClose.isPending} onClick={() => handleShortClose(r.id)}>
                        <XCircle className="size-4" /> Short-close
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
