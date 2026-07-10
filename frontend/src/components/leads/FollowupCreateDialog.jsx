import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateFollowup, useFollowupAssignees } from '@/hooks/useFollowups'

// "New follow-up" form — raised by a Lead Manager (Tech Req §8 / PRD §5.11).
// When `leadId` is supplied (the lead's own Follow Up tab) the lead is locked;
// otherwise (the "Other Tasks" screen) a lead is picked from `leads`.
export function FollowupCreateDialog({ open, onOpenChange, leadId, leads = [] }) {
  const { data: assignees = [] } = useFollowupAssignees()
  const createFollowup = useCreateFollowup()
  const empty = { title: '', followup_date: '', assigned_to: '', remark: '', lead: '' }
  const [form, setForm] = useState(empty)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const leadValue = leadId ?? form.lead
  // no past dates (global §3) — the date input's floor is today.
  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const valid = form.title && form.followup_date && form.assigned_to && leadValue

  async function handleCreate() {
    try {
      await createFollowup.mutateAsync({
        lead: leadValue,
        title: form.title,
        followup_date: form.followup_date,
        assigned_to: Number(form.assigned_to),
        remark: form.remark,
      })
      toast.success('Follow-up created')
      setForm(empty)
      onOpenChange(false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setForm(empty); onOpenChange(next) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New follow-up</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          {!leadId && (
            <div className="flex flex-col gap-1.5">
              <Label>Lead *</Label>
              <Select value={form.lead ? String(form.lead) : ''} onValueChange={(v) => set({ lead: v })}>
                <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.project_name} · {l.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Follow-up date *</Label>
            <Input type="date" min={minDate} value={form.followup_date} onChange={(e) => set({ followup_date: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Assign to *</Label>
            <Select value={form.assigned_to ? String(form.assigned_to) : ''} onValueChange={(v) => set({ assigned_to: v })}>
              <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
              <SelectContent>
                {assignees.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Remark</Label>
            <Textarea rows={2} value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!valid || createFollowup.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
