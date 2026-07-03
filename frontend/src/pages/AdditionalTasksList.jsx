import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserChip } from '@/components/shared/UserChip'
import { useFollowups, useCreateFollowup, useUpdateFollowup } from '@/hooks/useFollowups'
import { useLeads } from '@/hooks/useLeads'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatRelativeDue, isOverdue } from '@/lib/format'

// Ad-hoc action items, distinct from a lead's template checklist (§9.3) —
// same feature as the original "Follow-ups", renamed and living next to the
// Leads list rather than as its own nav item.
export default function AdditionalTasksList() {
  const { user } = useAuth()
  const { data: followups = [] } = useFollowups()
  const { data: leads = [] } = useLeads()
  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()
  const updateFollowup = useUpdateFollowup()
  const createFollowup = useCreateFollowup()

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', assigned_to: '', lead_id: '' })

  const leadById = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l])), [leads])
  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const assignableUsers = useMemo(() => (user.role === 'Representative' ? [user] : users.filter((u) => u.role !== 'Admin')), [users, user])

  const sorted = [...followups].sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.due_date) - new Date(b.due_date))

  async function handleCreate() {
    await createFollowup.mutateAsync({ ...form, lead_id: form.lead_id || null })
    toast.success('Additional task created')
    setCreateOpen(false)
    setForm({ title: '', due_date: '', assigned_to: '', lead_id: '' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Additional Tasks</h1>
          <p className="text-sm text-muted-foreground">Ad-hoc action items, separate from a lead's checklist.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New additional task</Button>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No additional tasks.</p>}
          {sorted.map((f) => {
            const overdue = !f.done && isOverdue(f.due_date)
            const lead = f.lead_id ? leadById[f.lead_id] : null
            return (
              <div key={f.id} className="flex items-center gap-3 p-3">
                <Checkbox checked={f.done} onCheckedChange={(checked) => updateFollowup.mutate({ id: f.id, patch: { done: !!checked } })} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${f.done ? 'text-muted-foreground line-through' : ''}`}>{f.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {lead && <Link to={`/leads/${lead.id}`} className="hover:underline">{companyById[lead.company_id]?.name} · {lead.code}</Link>}
                    <span>{formatDate(f.due_date)}</span>
                  </div>
                </div>
                {!f.done && <Badge variant={overdue ? 'destructive' : 'secondary'}>{formatRelativeDue(f.due_date)}</Badge>}
                <UserChip user={userById[f.assigned_to]} />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New additional task</DialogTitle></DialogHeader>
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
            <div className="flex flex-col gap-1.5">
              <Label>Related lead (optional)</Label>
              <Select value={form.lead_id} onValueChange={(v) => setForm((f) => ({ ...f, lead_id: v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {leads.map((l) => <SelectItem key={l.id} value={l.id}>{companyById[l.company_id]?.name} · {l.code}</SelectItem>)}
                </SelectContent>
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
