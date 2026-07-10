import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useResourceAllocations,
  useAllocationUsers,
  useUpdateAllocation,
  useSubmitAllocation,
} from '@/hooks/useResources'

// The 12 resource slots on the allocation form, in the order the docs list them
// (Tech Req §4.7 / PRD §5.7). `white` may be left blank — TBD is allowed.
const RESOURCE_FIELDS = [
  ['execution_red', 'Execution Red'],
  ['execution_brown', 'Execution Brown'],
  ['white', 'White'],
  ['auditor1', 'Auditor 1'],
  ['auditor2', 'Auditor 2'],
  ['auditor3', 'Auditor 3'],
  ['auditor4', 'Auditor 4'],
  ['project_member1', 'Project Member 1'],
  ['project_member2', 'Project Member 2'],
  ['project_member3', 'Project Member 3'],
  ['project_member4', 'Project Member 4'],
  ['project_member5', 'Project Member 5'],
]

const NONE = '__none__'

const STATUS_STYLES = {
  Pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Open: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

function StatusBadge({ status }) {
  return <Badge variant="secondary" className={STATUS_STYLES[status] || ''}>{status}</Badge>
}

function UserSelect({ value, onChange, users, disabled }) {
  return (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
      <SelectTrigger className="w-full"><SelectValue placeholder="— None —" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— None (TBD) —</SelectItem>
        {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.username})</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function AllocationDialog({ allocation, users, onClose }) {
  const update = useUpdateAllocation()
  const submit = useSubmitAllocation()
  const [form, setForm] = useState({})
  const [remark, setRemark] = useState('')

  useEffect(() => {
    if (!allocation) return
    const next = {}
    for (const [key] of RESOURCE_FIELDS) next[key] = allocation[key] || null
    setForm(next)
    setRemark(allocation.remark || '')
  }, [allocation])

  if (!allocation) return null
  const readOnly = allocation.status === 'Closed'
  const allocatedCount = RESOURCE_FIELDS.filter(([k]) => form[k]).length
  const over = allocatedCount > allocation.man_power_required
  const payload = { ...form, remark }

  async function handleSave() {
    await update.mutateAsync({ id: allocation.id, patch: payload })
    toast.success('Allocation saved')
    onClose()
  }

  async function handleSubmit() {
    await update.mutateAsync({ id: allocation.id, patch: payload })
    await submit.mutateAsync({ id: allocation.id })
    toast.success('Allocation submitted — next task opened')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Allocate resources — {allocation.type}</DialogTitle></DialogHeader>

        {/* Lead / man-power context (§7.4) shown above the allocation form. */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">{allocation.lead_project_name}</div>
          <div className="text-muted-foreground">{allocation.lead_company_name}</div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>Lead Manager: <b>{allocation.lead_manager?.name || '—'}</b></span>
            <span>Man-power required: <b>{allocation.man_power_required}</b></span>
            <span>Allocated: <b className={over ? 'text-red-600' : ''}>{allocatedCount}</b></span>
            <span>Status: <b>{allocation.status}</b></span>
          </div>
          {over && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle className="size-3.5" /> Allocated resources exceed the required man-power.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {RESOURCE_FIELDS.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label className="text-xs">{label}</Label>
              <UserSelect
                value={form[key]}
                users={users}
                disabled={readOnly}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Remark</Label>
          <Textarea value={remark} disabled={readOnly} onChange={(e) => setRemark(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={handleSave} disabled={update.isPending}>Save draft</Button>
              {allocation.status === 'Pending' && (
                <Button onClick={handleSubmit} disabled={update.isPending || submit.isPending}>
                  Submit &amp; open next task
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Resource Manager reporting screen (Tech Req §9.1 / PRD §5.7) — every
// allocation row with its status and an over-allocation indicator; Edit opens
// the allocation form with lead/man-power context.
export default function Resources() {
  const { data: allocations = [], isLoading } = useResourceAllocations()
  const { data: users = [] } = useAllocationUsers()
  const [editing, setEditing] = useState(null)

  const sorted = useMemo(
    () => [...allocations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [allocations],
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resource Allocation</h1>
        <p className="text-sm text-muted-foreground">Allocate resources for each workflow stage. Resources free up automatically as engagements finish.</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Man-power (allocated / required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No resource allocations yet.</TableCell></TableRow>
              )}
              {sorted.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.lead_project_name}</div>
                    <div className="text-xs text-muted-foreground">{a.lead_company_name}</div>
                  </TableCell>
                  <TableCell>{a.type}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    <span className={a.is_over_allocated ? 'font-medium text-red-600' : ''}>
                      {a.allocated_count} / {a.man_power_required}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {a.is_over_allocated && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="size-4 text-red-600" />
                          </TooltipTrigger>
                          <TooltipContent>Over-allocated: more resources than required</TooltipContent>
                        </Tooltip>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <AllocationDialog
          allocation={editing}
          users={users}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
