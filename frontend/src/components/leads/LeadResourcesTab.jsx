import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLeadResourceAllocations } from '@/hooks/useResources'

const STATUS_STYLES = {
  Pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Open: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

// "Open" = resources tied up on this stage; "Closed" = freed/released (Phase 10d).
const STATUS_TOOLTIP = { Open: 'Tied up', Closed: 'Freed / released', Pending: 'Not yet allocated' }

function names(list) {
  if (!list || list.length === 0) return null
  return list.map((u) => u?.name).filter(Boolean).join(', ')
}

// Read-only view of this lead's resource allocations, incl. which man-power was
// allocated (#6, Phase 11). Allocations are created + edited by the Resource
// Manager on the dedicated Resources screen (Tech Req §7 / PRD §5.7); this
// lead-scoped endpoint lets the lead's own people (assignee/creator/LM/admin)
// see them in context, read-only.
export function LeadResourcesTab({ leadId }) {
  const { data: allocations = [], isLoading } = useLeadResourceAllocations(leadId)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Man-power allocated for this lead's workflow stages. Managed by the Resource Manager on the Resources screen.
      </p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Execution Red</TableHead>
                <TableHead>Execution Brown(s)</TableHead>
                <TableHead>White(s)</TableHead>
                <TableHead>Man-power (allocated / required)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && allocations.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No resources allocated on this lead yet.</TableCell></TableRow>
              )}
              {allocations.map((a) => {
                const rn = a.resource_names || {}
                const brownOver = a.brown_count > a.man_power_brown
                const whiteOver = a.white_count > a.man_power_white
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_STYLES[a.status] || ''} title={STATUS_TOOLTIP[a.status] || ''}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{rn.execution_red?.name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-sm">{names(rn.execution_browns) || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{names(rn.whites) || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className={brownOver ? 'font-medium text-red-600' : ''}>Brown {a.brown_count} / {a.man_power_brown}</span>
                        <span className={whiteOver ? 'font-medium text-red-600' : ''}>White {a.white_count} / {a.man_power_white}</span>
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
