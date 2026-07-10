import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useResourceAllocations } from '@/hooks/useResources'

const STATUS_STYLES = {
  Pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Open: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

// Read-only view of this lead's resource allocations (Phase 6). Allocations are
// created + edited by the Resource Manager on the dedicated Resources screen
// (Tech Req §7 / PRD §5.7); here they're surfaced in context on the lead. The
// list endpoint returns [] for non-RM users (backend gates it), so the tab
// simply shows the empty state for them.
export function LeadResourcesTab({ leadId }) {
  const { data: allocations = [], isLoading } = useResourceAllocations({ leadId })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Resources allocated for this lead's workflow stages. Managed by the Resource Manager on the Resources screen.
      </p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Execution Red</TableHead>
                <TableHead>Man-power (allocated / required)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && allocations.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No resource allocations on this lead.</TableCell></TableRow>
              )}
              {allocations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.type}</TableCell>
                  <TableCell><Badge variant="secondary" className={STATUS_STYLES[a.status] || ''}>{a.status}</Badge></TableCell>
                  <TableCell className="text-sm">{a.resource_names?.execution_red?.name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell>
                    <span className={a.is_over_allocated ? 'font-medium text-red-600' : ''}>
                      {a.allocated_count} / {a.man_power_required}
                    </span>
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
