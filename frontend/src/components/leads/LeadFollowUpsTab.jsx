import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserChip } from '@/components/shared/UserChip'
import { FollowupUpdateDialog } from './FollowupUpdateDialog'
import { useFollowups, useCreateFollowup } from '@/hooks/useFollowups'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'
import { formatDate, formatRelativeDue, isOverdue } from '@/lib/format'

// The lead's own follow-ups — same functionality as the cross-lead Follow ups
// page (§13), but the current lead is implicit and locked: there's no
// "related lead" selector here since we're already inside that lead.
export function LeadFollowUpsTab({ leadId }) {
  const { user } = useAuth()
  const { data: followups = [] } = useFollowups({ leadId })
  const { data: users = [] } = useUsers()
  const createFollowup = useCreateFollowup()
  const canManage = PERMISSIONS.manageFollowups(user)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', assigned_to: '' })
  const [activeFollowup, setActiveFollowup] = useState(null)

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const isExecutionOnly = !hasRole(user, 'Lead Manager') && !hasRole(user, 'Lead Admin')
  const assignableUsers = useMemo(() => (isExecutionOnly ? [user] : users.filter((u) => !hasRole(u, 'Lead Admin'))), [users, user, isExecutionOnly])

  const sorted = [...followups].sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.due_date) - new Date(b.due_date))

  async function handleCreate() {
    await createFollowup.mutateAsync({ ...form, lead_id: leadId })
    toast.success('Follow up created')
    setCreateOpen(false)
    setForm({ title: '', due_date: '', assigned_to: '' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ad-hoc action items on this lead, separate from its checklist.</p>
        {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New follow up</Button>}
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No follow ups on this lead.</p>}
          {sorted.map((f) => {
            const overdue = !f.done && isOverdue(f.due_date)
            return (
              <div key={f.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={f.done ? 'outline' : 'secondary'}>{f.done ? 'Closed' : 'Open'}</Badge>
                    <p className={`text-sm ${f.done ? 'text-muted-foreground' : ''}`}>{f.title}</p>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(f.due_date)}</span>
                    {overdue && <Badge variant="destructive">{formatRelativeDue(f.due_date)}</Badge>}
                  </div>
                </div>
                <UserChip user={userById[f.assigned_to]} />
                <Button size="sm" variant="outline" onClick={() => setActiveFollowup(f)}>{canManage ? 'Update status' : 'View'}</Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <FollowupUpdateDialog followup={activeFollowup} userById={userById} canManage={canManage} onClose={() => setActiveFollowup(null)} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New follow up</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Due date *</Label><Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Assign to *</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                <SelectContent>{assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.title || !form.due_date || !form.assigned_to}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
