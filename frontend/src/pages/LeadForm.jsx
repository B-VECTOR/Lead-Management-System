import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCompanies, useCreateCompany } from '@/hooks/useCompanies'
import { useLeadTypes } from '@/hooks/useLeadTypes'
import { useUsers } from '@/hooks/useUsers'
import { useCreateLead, useLead, useUpdateLead } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PRODUCT_MODULES, PLAN_TIERS, PRIORITIES } from '@/mocks/seed'
import { createProject } from '@/api/projects'
import { toast } from 'sonner'

const COMPANY_INDUSTRIES = ['Retail', 'Healthcare', 'Finance', 'Logistics', 'Education', 'Manufacturing', 'Government', 'SaaS/Tech', 'Other']

const emptyForm = {
  company_id: '', lead_type_id: '', industry: '', domain: '',
  product_modules: [], priority: 'Low', owner_id: '', source_detail: '', tags: '',
  plan: '', seats: '', billing_cycle: 'Annual', acv: '', contract_length: '', currency: 'USD',
  expected_close_date: '', description: '', internal_notes: '',
}

const emptyProject = { name: '', description: '', assigned_to: '', start_date: '', target_date: '' }

export default function LeadForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: companies = [] } = useCompanies()
  const { data: leadTypes = [] } = useLeadTypes()
  const { data: users = [] } = useUsers()
  const { data: existingLead } = useLead(isEdit ? id : undefined)
  const createLead = useCreateLead()
  const updateLead = useUpdateLead()
  const createCompany = useCreateCompany()

  const managers = useMemo(() => users.filter((u) => u.role === 'Manager' || u.role === 'Admin'), [users])
  const reps = useMemo(() => users.filter((u) => u.role === 'Representative'), [users])

  const [form, setForm] = useState(emptyForm)
  const [project, setProject] = useState(emptyProject)
  const [newCompanyOpen, setNewCompanyOpen] = useState(false)
  const [newCompany, setNewCompany] = useState({ name: '', industry: '', size: 'SMB' })

  useEffect(() => {
    if (isEdit && existingLead) {
      setForm({
        company_id: existingLead.company_id,
        lead_type_id: existingLead.lead_type_id, industry: existingLead.industry, domain: existingLead.domain || '',
        product_modules: existingLead.product_modules || [], priority: existingLead.priority, owner_id: existingLead.owner_id,
        source_detail: existingLead.source_detail || '', tags: (existingLead.tags || []).join(', '),
        plan: existingLead.plan || '', seats: existingLead.seats || '', billing_cycle: existingLead.billing_cycle || 'Annual',
        acv: existingLead.acv || '', contract_length: existingLead.contract_length || '', currency: existingLead.currency || 'USD',
        expected_close_date: existingLead.expected_close_date ? existingLead.expected_close_date.slice(0, 10) : '',
        description: existingLead.description || '', internal_notes: existingLead.internal_notes || '',
      })
    } else if (!isEdit) {
      setForm((f) => ({ ...f, owner_id: user.role === 'Manager' ? user.id : f.owner_id, lead_type_id: leadTypes[0]?.id || '' }))
    }
  }, [isEdit, existingLead, leadTypes, user])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setProjectField(key, value) {
    setProject((p) => ({ ...p, [key]: value }))
  }

  function toggleModule(mod) {
    setForm((f) => ({
      ...f,
      product_modules: f.product_modules.includes(mod) ? f.product_modules.filter((m) => m !== mod) : [...f.product_modules, mod],
    }))
  }

  async function handleCreateCompany() {
    const created = await createCompany.mutateAsync(newCompany)
    set('company_id', created.id)
    if (!form.industry) set('industry', created.industry)
    setNewCompanyOpen(false)
    setNewCompany({ name: '', industry: '', size: 'SMB' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      seats: form.seats ? Number(form.seats) : null,
      acv: form.acv ? Number(form.acv) : null,
      contract_length: form.contract_length ? Number(form.contract_length) : null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      expected_close_date: form.expected_close_date || null,
    }
    try {
      if (isEdit) {
        await updateLead.mutateAsync({ id, patch: payload })
        toast.success('Lead updated')
        navigate(`/leads/${id}`)
      } else {
        const created = await createLead.mutateAsync(payload)
        if (project.name.trim()) {
          await createProject(created.id, project, user)
          toast.success('Lead and project created')
        } else {
          toast.success('Lead created')
        }
        navigate(`/leads/${created.id}`)
      }
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saving = createLead.isPending || updateLead.isPending

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit lead' : 'New lead'}</h1>
        <p className="text-sm text-muted-foreground">A lead is a sales opportunity with a client company.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identity & classification</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Company *</Label>
            <div className="flex gap-2">
              <Select value={form.company_id} onValueChange={(v) => {
                set('company_id', v)
                const c = companies.find((c) => c.id === v)
                if (c) set('industry', c.industry)
              }}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select a company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={() => setNewCompanyOpen(true)}><Plus className="size-4" /> New</Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Lead type *</Label>
            <Select value={form.lead_type_id} onValueChange={(v) => set('lead_type_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {leadTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Industry *</Label>
            <Select value={form.industry} onValueChange={(v) => set('industry', v)}>
              <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {COMPANY_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Domain</Label>
            <Input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="e.g. Payments" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Product modules in scope</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRODUCT_MODULES.map((mod) => (
                <label key={mod} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.product_modules.includes(mod)} onCheckedChange={() => toggleModule(mod)} />
                  {mod}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ownership & status</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Owner (Manager) *</Label>
            <Select value={form.owner_id} onValueChange={(v) => set('owner_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Source detail</Label>
            <Input value={form.source_detail} onChange={(e) => set('source_detail', e.target.value)} placeholder="e.g. Referral by X" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tags (comma separated)</Label>
            <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. strategic, expansion" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Commercials</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Plan / edition</Label>
            <Select value={form.plan} onValueChange={(v) => set('plan', v)}>
              <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
              <SelectContent>
                {PLAN_TIERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Seats / licenses</Label>
            <Input type="number" min="0" value={form.seats} onChange={(e) => set('seats', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Billing cycle</Label>
            <Select value={form.billing_cycle} onValueChange={(v) => set('billing_cycle', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ACV (annual contract value)</Label>
            <Input type="number" min="0" value={form.acv} onChange={(e) => set('acv', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contract length (months)</Label>
            <Input type="number" min="0" value={form.contract_length} onChange={(e) => set('contract_length', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Expected close date</Label>
            <Input type="date" value={form.expected_close_date} onChange={(e) => set('expected_close_date', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lifecycle & notes</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Description / requirement summary</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Internal notes (not client-facing)</Label>
            <Textarea rows={3} value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project (optional)</CardTitle>
            <p className="text-sm text-muted-foreground">Kick off the first project now, or add one later from the lead's Projects tab.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Project name</Label>
              <Input value={project.name} onChange={(e) => setProjectField('name', e.target.value)} placeholder="e.g. Pilot rollout — HR dept" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={project.description} onChange={(e) => setProjectField('description', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Assign to (Representative)</Label>
              <Select value={project.assigned_to} onValueChange={(v) => setProjectField('assigned_to', v)}>
                <SelectTrigger><SelectValue placeholder="Select a rep" /></SelectTrigger>
                <SelectContent>{reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div />
            <div className="flex flex-col gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={project.start_date} onChange={(e) => setProjectField('start_date', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Target date</Label>
              <Input type="date" value={project.target_date} onChange={(e) => setProjectField('target_date', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" disabled={saving || !form.company_id || !form.lead_type_id}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create lead'}
        </Button>
      </div>

      <Dialog open={newCompanyOpen} onOpenChange={setNewCompanyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New company</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name *</Label>
              <Input value={newCompany.name} onChange={(e) => setNewCompany((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Industry *</Label>
              <Select value={newCompany.industry} onValueChange={(v) => setNewCompany((c) => ({ ...c, industry: v }))}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {COMPANY_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Company size</Label>
              <Select value={newCompany.size} onValueChange={(v) => setNewCompany((c) => ({ ...c, size: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMB">SMB</SelectItem>
                  <SelectItem value="Mid">Mid</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCompanyOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCompany} disabled={!newCompany.name || !newCompany.industry}>Create company</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
