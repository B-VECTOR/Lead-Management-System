import { useState } from 'react'
import { Plus, Bell, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BeltBadge } from '@/components/shared/StatusBadge'
import { useUsers, useCreateUser } from '@/hooks/useUsers'
import {
  useLeadTypes, useCreateLeadType, useCreateTaskStep,
  useCreateChecklistTemplateItem, useDeleteChecklistTemplateItem, useDeleteTaskStep,
} from '@/hooks/useLeadTypes'
import { BELTS, ROLES, PRODUCT_MODULES, PLAN_TIERS } from '@/mocks/seed'
import { toast } from 'sonner'

function UsersTab() {
  const { data: users = [] } = useUsers()
  const createUser = useCreateUser()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'Representative', belt: 'red', manager_id: '' })
  const managers = users.filter((u) => u.role === 'Manager')

  async function handleCreate() {
    await createUser.mutateAsync({ ...form, manager_id: form.role === 'Representative' ? form.manager_id : null })
    toast.success('User created')
    setOpen(false)
    setForm({ name: '', email: '', role: 'Representative', belt: 'red', manager_id: '' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Add user</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Belt</TableHead><TableHead>Manager</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                  <TableCell><BeltBadge belt={u.belt} /></TableCell>
                  <TableCell className="text-muted-foreground">{users.find((m) => m.id === u.manager_id)?.name || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Belt (display only)</Label>
              <Select value={form.belt} onValueChange={(v) => setForm((f) => ({ ...f, belt: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BELTS.map((b) => <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.role === 'Representative' && (
              <div className="flex flex-col gap-1.5">
                <Label>Manager *</Label>
                <Select value={form.manager_id} onValueChange={(v) => setForm((f) => ({ ...f, manager_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.email || (form.role === 'Representative' && !form.manager_id)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NewStepForm({ leadTypeId, order }) {
  const [name, setName] = useState('')
  const createStep = useCreateTaskStep()
  return (
    <div className="flex gap-2">
      <Input placeholder="New step name…" value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        variant="outline"
        disabled={!name.trim()}
        onClick={async () => { await createStep.mutateAsync({ leadTypeId, data: { name }, order }); setName('') }}
      >
        <Plus className="size-4" /> Add step
      </Button>
    </div>
  )
}

function NewChecklistItemForm({ taskStepId, order }) {
  const [label, setLabel] = useState('')
  const [requiresFile, setRequiresFile] = useState(false)
  const [notify, setNotify] = useState(false)
  const createItem = useCreateChecklistTemplateItem()

  async function submit() {
    await createItem.mutateAsync({ taskStepId, data: { label, requires_file: requiresFile, notify }, order })
    setLabel(''); setRequiresFile(false); setNotify(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
      <Input placeholder="New checklist item…" value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-[180px] flex-1" />
      <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={requiresFile} onCheckedChange={setRequiresFile} /> Requires file</label>
      <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={notify} onCheckedChange={setNotify} /> Notify</label>
      <Button size="sm" variant="outline" disabled={!label.trim()} onClick={submit}><Plus className="size-3.5" /> Add</Button>
    </div>
  )
}

function LeadTypesTab() {
  const { data: leadTypes = [] } = useLeadTypes()
  const createLeadType = useCreateLeadType()
  const deleteItem = useDeleteChecklistTemplateItem()
  const deleteStep = useDeleteTaskStep()
  const [newTypeOpen, setNewTypeOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')

  async function handleCreateType() {
    await createLeadType.mutateAsync({ name: newTypeName })
    toast.success('Lead type created — add its steps below')
    setNewTypeOpen(false)
    setNewTypeName('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leadTypes.length} of 3 lead types configured. Templates here drive the checklist a project instantiates (§7).
        </p>
        <Button size="sm" onClick={() => setNewTypeOpen(true)}><Plus className="size-4" /> New lead type</Button>
      </div>

      {leadTypes.map((type) => (
        <Card key={type.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {type.name}
              {!type.active && <Badge variant="secondary">Inactive</Badge>}
            </CardTitle>
            {type.description && <p className="text-sm text-muted-foreground">{type.description}</p>}
            {type.customFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {type.customFields.map((f) => (
                  <Badge key={f.id} variant="outline">{f.field_name} ({f.field_type})</Badge>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {type.taskSteps.map((step) => (
              <div key={step.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{step.order}. {step.name}</p>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => deleteStep.mutate(step.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {step.checklistItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-sm">
                      <span>{item.label}</span>
                      <div className="flex items-center gap-1.5">
                        {item.requires_file && <Paperclip className="size-3.5 text-muted-foreground" />}
                        {item.notify && <Bell className="size-3.5 text-muted-foreground" />}
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => deleteItem.mutate(item.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <NewChecklistItemForm taskStepId={step.id} order={step.checklistItems.length + 1} />
                </div>
              </div>
            ))}
            <NewStepForm leadTypeId={type.id} order={type.taskSteps.length + 1} />
          </CardContent>
        </Card>
      ))}

      <Dialog open={newTypeOpen} onOpenChange={setNewTypeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New lead type</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5"><Label>Name *</Label><Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTypeOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateType} disabled={!newTypeName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DropdownsTab() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Product modules / editions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {PRODUCT_MODULES.map((m) => <Badge key={m} variant="outline">{m}</Badge>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Plan tiers</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {PLAN_TIERS.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        These lists are placeholders (specs.md §19 [DECIDE]). A dedicated editor UI is a "Later" item (§12.3) — for now, edit the seed values in <code>src/mocks/seed.js</code>.
      </p>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Admin-only configuration: users, lead types, and templates.</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="lead-types">Lead types & checklists</TabsTrigger>
          <TabsTrigger value="dropdowns">Dropdowns</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="lead-types"><LeadTypesTab /></TabsContent>
        <TabsContent value="dropdowns"><DropdownsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
