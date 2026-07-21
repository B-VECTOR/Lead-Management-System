import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { useHeldLeads, useUnholdLead } from '@/hooks/useHolds'

// "Held Leads" menu (Tech Req §6 / PRD §5.8) — every lead currently On Hold
// that the signed-in user can see, with a one-click Unhold that also restores
// the lead's held tasks.
export default function HeldLeads() {
  const navigate = useNavigate()
  const { data: leads = [], isLoading } = useHeldLeads()
  const unhold = useUnholdLead()
  const columnCount = 6

  function handleUnhold(e, leadId) {
    e.stopPropagation()
    unhold.mutate(
      { leadId },
      {
        onSuccess: () => toast.success('Lead resumed'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Held Leads</h1>
        <p className="text-sm text-muted-foreground">Leads currently on hold. Unholding a lead resumes its held tasks too.</p>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && leads.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No leads are on hold.</TableCell></TableRow>
              )}
              {leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <TableCell>
                    <Link to={`/leads/${lead.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {lead.project_name}
                    </Link>
                  </TableCell>
                  <TableCell>{lead.company_name || '—'}</TableCell>
                  <TableCell><LeadTypeBadge type={lead.lead_type} /></TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-sm">{lead.assigned_to_name || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={unhold.isPending} onClick={(e) => handleUnhold(e, lead.id)}>
                      <PlayCircle className="size-4" /> Unhold
                    </Button>
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
