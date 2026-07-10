import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FollowupUpdateDialog } from './FollowupUpdateDialog'
import { FollowupCreateDialog } from './FollowupCreateDialog'
import { useFollowups } from '@/hooks/useFollowups'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { formatDate, formatRelativeDue, isOverdue } from '@/lib/format'

// A single lead's follow-ups — wired to the real backend (Phase 7). Lists the
// follow-ups the caller may see on this lead (assignee / creator, or all for a
// Lead Admin — "View all follow-up history"); a Lead Manager can raise a new
// one against the lead. The current lead is implicit (no lead selector).
export function LeadFollowUpsTab({ leadId }) {
  const { user } = useAuth()
  const { data: followups = [] } = useFollowups({ leadId })
  const canManage = PERMISSIONS.manageFollowups(user)

  const [createOpen, setCreateOpen] = useState(false)
  const [activeFollowup, setActiveFollowup] = useState(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ad-hoc follow-ups on this lead, separate from its checklist.</p>
        {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New follow-up</Button>}
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {followups.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No follow-ups on this lead.</p>}
          {followups.map((f) => {
            const overdue = f.status !== 'done' && isOverdue(f.followup_date)
            return (
              <div key={f.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={f.status === 'done' ? 'outline' : 'secondary'}>{f.status === 'done' ? 'Done' : 'Open'}</Badge>
                    <p className={`text-sm ${f.status === 'done' ? 'text-muted-foreground' : ''}`}>{f.title}</p>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(f.followup_date)}</span>
                    {overdue && <Badge variant="destructive">{formatRelativeDue(f.followup_date)}</Badge>}
                    {f.assigned_to_name && <span>· {f.assigned_to_name}</span>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActiveFollowup(f)}>Open</Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <FollowupUpdateDialog followup={activeFollowup} onClose={() => setActiveFollowup(null)} />
      <FollowupCreateDialog open={createOpen} onOpenChange={setCreateOpen} leadId={leadId} />
    </div>
  )
}
