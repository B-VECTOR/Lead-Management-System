import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CompanyCombobox } from '@/components/leads/CompanyCombobox'
import { useCompanies, useCreateCompany } from '@/hooks/useCompanies'
import { useLeadTypes } from '@/hooks/useLeadTypes'
import { useUsers } from '@/hooks/useUsers'
import { useCreateLead, useLead, useUpdateLead } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PRODUCT_MODULES, PRIORITIES, DOMAINS } from '@/mocks/seed'
import { toast } from 'sonner'

const COMPANY_INDUSTRIES = ['Retail', 'Healthcare', 'Finance', 'Logistics', 'Education', 'Manufacturing', 'Government', 'SaaS/Tech', 'Other']
const UNASSIGNED = '__unassigned__'

const emptyForm = {
  name: '', company_id: '', lead_type_id: '', industry: '', domain: '',
  product_modules: [], conversion_reminder: 'none', priority: 'Medium', owner_id: '', source_detail: '', tags: '',
  assigned_to: '', start_date: '', target_date: '',
  description: '', internal_notes: '',
}

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
  const bdType = useMemo(() => leadTypes.find((t) => t.name === 'BD'), [leadTypes])

  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (isEdit && existingLead) {
      setForm({
        name: existingLead.name || '',
        company_id: existingLead.company_id,
        lead_type_id: existingLead.lead_type_id, industry: existingLead.industry, domain: existingLead.domain || '',
        product_modules: existingLead.product_modules || [], conversion_reminder: existingLead.conversion_reminder || 'none',
        priority: existingLead.priority, owner_id: existingLead.owner_id,
        source_detail: existingLead.source_detail || '', tags: (existingLead.tags || []).join(', '),
        assigned_to: existingLead.assigned_to || '',
        start_date: existingLead.start_date ? existingLead.start_date.slice(0, 10) : '',
        target_date: existingLead.target_date ? existingLead.target_date.slice(0, 10) : '',
        description: existingLead.description || '', internal_notes: existingLead.internal_notes || '',
      })
    } else if (!isEdit) {
      setForm((f) => ({ ...f, owner_id: user.role === 'Manager' ? user.id : f.owner_id, lead_type_id: leadTypes[0]?.id || '' }))
    }
  }, [isEdit, existingLead, leadTypes, user])

  useEffect(() => {
    if (bdType && form.lead_type_id !== bdType.id && form.conversion_reminder !== 'none') {
      setForm((f) => ({ ...f, conversion_reminder: 'none' }))
    }
  }, [form.lead_type_id, form.conversion_reminder, bdType])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleModule(mod) {
    setForm((f) => ({
      ...f,
      product_modules: f.product_modules.includes(mod) ? f.product_modules.filter((m) => m !== mod) : [...f.product_modules, mod],
    }))
  }

  async function handleSelectCompany(company) {
    set('company_id', company.id)
    set('industry', company.industry)
  }

  async function handleCreateCompany(name) {
    const created = await createCompany.mutateAsync({ name, industry: form.industry || 'Other' })
    set('company_id', created.id)
    if (!form.industry) set('industry', created.industry)
    toast.success(`Created "${name}"`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      start_date: form.start_date || null,
      target_date: form.target_date || null,
    }
    try {
      if (isEdit) {
        await updateLead.mutateAsync({ id, patch: payload })
        toast.success('Lead updated')
        navigate(`/leads/${id}`)
      } else {
        const created = await createLead.mutateAsync(payload)
        toast.success('Lead created')
        navigate(`/leads/${created.id}`)
      }
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saving = createLead.isPending || updateLead.isPending
  const canSubmit = form.name.trim() && form.company_id && form.lead_type_id && form.industry && form.owner_id

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit lead' : 'New lead'}</h1>
        <p className="text-sm text-muted-foreground">A lead carries exactly one execution track. Assign a rep now, or leave it unassigned and the owner can pick one later.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Identity & classification</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Project name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Store Analytics Rollout" />
            <p className="text-xs text-muted-foreground">Shown in the leads list to tell apart multiple leads from the same company.</p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Company *</Label>
            <CompanyCombobox companies={companies} value={form.company_id} onSelect={handleSelectCompany} onCreate={handleCreateCompany} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Lead type *</Label>
            <Select value={form.lead_type_id} onValueChange={(v) => set('lead_type_id', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {leadTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Conversion reminder</Label>
            <Select value={form.conversion_reminder} onValueChange={(v) => set('conversion_reminder', v)} disabled={!bdType || form.lead_type_id !== bdType.id}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reminder</SelectItem>
                <SelectItem value="mining" disabled={!form.start_date}>Remind to convert → Mining</SelectItem>
                <SelectItem value="extension" disabled={!form.target_date}>Remind to convert → Extension</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {!bdType || form.lead_type_id !== bdType.id
                ? 'Only available for BD leads.'
                : form.conversion_reminder === 'mining'
                  ? 'Reminds 6 months after the start date to consider converting to Mining.'
                  : form.conversion_reminder === 'extension'
                    ? 'Reminds 2 months before the target date to consider converting to Extension.'
                    : 'Optionally schedule a reminder to revisit this BD lead later.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Industry *</Label>
            <Select value={form.industry} onValueChange={(v) => set('industry', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {COMPANY_INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Domain</Label>
            <Select value={form.domain} onValueChange={(v) => set('domain', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select domain" /></SelectTrigger>
              <SelectContent>
                {DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
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
        <CardHeader><CardTitle className="text-base">Ownership & assignment</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Owner (Manager) *</Label>
            <Select value={form.owner_id} onValueChange={(v) => set('owner_id', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Assigned to (Representative)</Label>
            <Select value={form.assigned_to || UNASSIGNED} onValueChange={(v) => set('assigned_to', v === UNASSIGNED ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a rep" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned — assign later</SelectItem>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Optional — if left unassigned, the lead's owner (manager) can assign a rep later from the lead page.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
            <Label>Start date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Target date</Label>
            <Input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Tags (comma separated)</Label>
            <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. strategic, expansion" />
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" disabled={saving || !canSubmit}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create lead'}
        </Button>
      </div>

    </form>
  )
}
