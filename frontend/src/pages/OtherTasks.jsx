import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FollowupUpdateDialog } from '@/components/leads/FollowupUpdateDialog'
import { FollowupCreateDialog } from '@/components/leads/FollowupCreateDialog'
import { useFollowups } from '@/hooks/useFollowups'
import { useLeads } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { formatDate, formatRelativeDue, isOverdue } from '@/lib/format'

// "Other Tasks" (Tech Req §8 / PRD §5.11) — the shared screen surfacing the
// follow-ups assigned to the logged-in user (an Employee sees ones assigned to
// them; a Lead Manager sees ones they self-assigned). A Lead Manager can also
// raise a new follow-up here via the standalone "Add follow-up" action, which
// carries a lead dropdown.
export default function OtherTasks() {
  const { user } = useAuth()
  const { data: followups = [], isLoading } = useFollowups({ assignedToMe: true })
  const canManage = PERMISSIONS.manageFollowups(user)
  const { data: leads = [] } = useLeads()

  const [createOpen, setCreateOpen] = useState(false)
  const [activeFollowup, setActiveFollowup] = useState(null)
  const columnCount = 5

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Follow up</h1>
          <p className="text-sm text-muted-foreground">Follow-ups assigned to you, separate from a lead's checklist.</p>
        </div>
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New follow-up</Button>}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Follow-up</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && followups.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No follow-ups assigned to you.</TableCell></TableRow>
              )}
              {followups.map((f) => {
                const overdue = f.status !== 'done' && isOverdue(f.followup_date)
                return (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => setActiveFollowup(f)}>
                    <TableCell className="text-sm">{f.title}</TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{f.lead_project_name}</span>
                      <span className="text-muted-foreground"> · {f.lead_company_name}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(f.followup_date)}
                      {overdue && <Badge variant="destructive" className="ml-2">{formatRelativeDue(f.followup_date)}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.status === 'done' ? 'outline' : 'secondary'}>{f.status === 'done' ? 'Done' : 'Open'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setActiveFollowup(f) }}>Open</Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FollowupUpdateDialog followup={activeFollowup} onClose={() => setActiveFollowup(null)} />
      <FollowupCreateDialog open={createOpen} onOpenChange={setCreateOpen} leads={leads} />
    </div>
  )
}
