import { Card, CardContent } from '@/components/ui/card'
import { AllocationStatusBadge, StageBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { useLeadResourceAllocations } from '@/hooks/useResources'

const STATUS_TOOLTIP = { allocated: 'Currently occupying the slot', released: 'Freed / released' }

// Read-only view of this lead's resource-allocation history (§4.7, R5 rebuild)
// — one row per resource/slot/stage, incl. past (released) occupants so a
// reassignment's history stays visible. Allocations are staffed by the
// Resource Manager or the lead's Default BD Person on the Resources screen
// (Tech Req §7 / PRD §5.7); this lead-scoped endpoint lets the lead's own
// people (assignee/creator/LM/admin) see them in context, read-only.
export function LeadResourcesTab({ leadId }) {
  const { data: allocations = [], isLoading } = useLeadResourceAllocations(leadId)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Resources allocated across this lead's workflow stages, newest first. Managed by the Resource
        Manager (or the lead owner) on the Resources screen.
      </p>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Allocated on</TableHead>
                <TableHead>Released on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && allocations.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No resources allocated on this lead yet.</TableCell></TableRow>
              )}
              {allocations.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><StageBadge stage={a.stage_code} /></TableCell>
                  <TableCell className="font-medium">{a.slot_label}</TableCell>
                  <TableCell className="text-sm">
                    {a.user_name?.name || (a.is_tbd ? <span className="text-muted-foreground">TBD</span> : <span className="text-muted-foreground">—</span>)}
                  </TableCell>
                  <TableCell>
                    <AllocationStatusBadge status={a.status} title={STATUS_TOOLTIP[a.status] || ''} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(a.allocated_on)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.released_on ? formatDate(a.released_on) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
