import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useResourceRequests, useCreateResourceRequest } from '@/hooks/useResources'
import { useAuth } from '@/context/AuthContext'
import { useUsers } from '@/hooks/useUsers'
import { PERMISSIONS } from '@/api/scope'
import { RESOURCE_REQUEST_TYPES } from '@/mocks/seed'
import { formatDate } from '@/lib/format'

const emptyForm = { type: '', due_date: '' }

// Request a resource (2Hr Study, SnT, ...) needed to move the lead forward.
// Who actually fulfills these isn't built yet — the destination role/person
// is TBD — so for now a request just records what's needed and by when.
export function LeadResourcesTab({ leadId }) {
  const { user } = useAuth()
  const { data: requests = [] } = useResourceRequests(leadId)
  const { data: users = [] } = useUsers()
  const createRequest = useCreateResourceRequest()
  const canManage = PERMISSIONS.manageFollowups(user)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const userById = Object.fromEntries(users.map((u) => [u.id, u]))
  const sorted = [...requests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  async function handleCreate() {
    await createRequest.mutateAsync({ ...form, lead_id: leadId })
    toast.success('Resource requested')
    setCreateOpen(false)
    setForm(emptyForm)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Request a resource needed to move this lead forward.</p>
        {canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New request</Button>}
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {sorted.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No resource requests on this lead.</p>}
          {sorted.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{r.status}</Badge>
                  <p className="text-sm font-medium">{r.type}</p>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Due {formatDate(r.due_date)}</span>
                  <span>· Requested by {userById[r.requested_by]?.name || 'Unknown'}</span>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request a resource</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Resource type *</Label>
              <Select value={form.type} onValueChange={(v) => v && setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a resource type" /></SelectTrigger>
                <SelectContent>{RESOURCE_REQUEST_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date *</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.type || !form.due_date}>Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
