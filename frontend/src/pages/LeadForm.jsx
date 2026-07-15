import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateLead, useLead, useUpdateLead } from '@/hooks/useLeads'
import { useCountries, useIndustries, useAreas, useAssignableUsers } from '@/hooks/useLookups'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS, hasRole } from '@/api/scope'
import { toast } from 'sonner'

// Two lead types only (Decision #6 — Extension is a BD workflow cycle, not a type).
const LEAD_TYPES = ['BD', 'Mining']

const emptyForm = {
  country: '', company_name: '', project_name: '', industry: '', domain: '',
  division: '', scope: '', assigned_to: '', lead_type: 'BD',
}

export default function LeadForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: countries = [] } = useCountries()
  const { data: industries = [] } = useIndustries()
  const { data: areas = [] } = useAreas()
  const { data: existingLead } = useLead(isEdit ? id : undefined)
  const createLead = useCreateLead()
  const updateLead = useUpdateLead()

  // Only Lead Managers / Lead Admins may set who the lead is assigned to;
  // Marketing's assigned-to field is hidden (server forces "Not Assigned").
  // The assignable-users lookup is gated to those roles, so only fetch it when
  // the picker will be shown. ("Owner" is the lead's creator, not this field —
  // Phase 9.)
  const canAssignOwner = hasRole(user, 'Lead Manager') || hasRole(user, 'Lead Admin')
  const { data: owners = [] } = useAssignableUsers(canAssignOwner)
  // A Lead Manager must pick who it's assigned to at creation; Marketing never sees the field.
  const ownerRequired = hasRole(user, 'Lead Manager') && !isEdit

  const [form, setForm] = useState(emptyForm)

  // Route guard: buttons are hidden for unauthorized users, but block direct
  // URL navigation too.
  useEffect(() => {
    if (!isEdit && !PERMISSIONS.createLead(user)) {
      navigate('/leads', { replace: true })
    } else if (isEdit && existingLead && !PERMISSIONS.editLead(user, existingLead)) {
      navigate(`/leads/${id}`, { replace: true })
    }
  }, [isEdit, existingLead, user, id, navigate])

  useEffect(() => {
    if (isEdit && existingLead) {
      setForm({
        country: existingLead.country || '',
        company_name: existingLead.company_name || '',
        project_name: existingLead.project_name || '',
        industry: existingLead.industry || '',
        domain: existingLead.domain || '',
        division: existingLead.division || '',
        scope: existingLead.scope || '',
        assigned_to: existingLead.assigned_to || '',
        lead_type: existingLead.lead_type || 'BD',
      })
    }
  }, [isEdit, existingLead])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Radix Select can momentarily emit onValueChange('') via its hidden native
  // <select> before options register; none of these fields have a legitimate
  // blank state, so ignore falsy writes.
  function setIfPresent(key, value) {
    if (value) set(key, value)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Build the payload; only send assigned_to when this user controls it.
    const payload = {
      country: form.country,
      company_name: form.company_name.trim(),
      project_name: form.project_name.trim(),
      industry: form.industry,
      domain: form.domain,
      division: form.division.trim(),
      scope: form.scope.trim(),
      lead_type: form.lead_type,
    }
    if (canAssignOwner) payload.assigned_to = form.assigned_to || null

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
  const canSubmit =
    form.country && form.company_name.trim() && form.project_name.trim() &&
    form.industry && form.domain && form.lead_type &&
    (!ownerRequired || form.assigned_to)

  if (!isEdit && !PERMISSIONS.createLead(user)) return null
  if (isEdit && existingLead && !PERMISSIONS.editLead(user, existingLead)) return null

  const marketingNote = hasRole(user, 'Marketing') && !canAssignOwner

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit lead' : 'New lead'}</h1>
        <p className="text-sm text-muted-foreground">
          {marketingNote
            ? 'Marketing leads are created as "Not Assigned" — a Lead Admin assigns it to someone to start the workflow.'
            : 'Fill in the lead details below. The BD workflow starts once the lead is assigned to someone.'}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lead details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Country *</Label>
            <Select value={form.country ? String(form.country) : ''} onValueChange={(v) => setIfPresent('country', Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                {countries.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Lead type *</Label>
            <Select value={form.lead_type} onValueChange={(v) => setIfPresent('lead_type', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {LEAD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Company name *</Label>
            <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="e.g. Acme Corp" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Project name *</Label>
            <Input value={form.project_name} onChange={(e) => set('project_name', e.target.value)} placeholder="e.g. Store Analytics Rollout" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Industry *</Label>
            <Select value={form.industry ? String(form.industry) : ''} onValueChange={(v) => setIfPresent('industry', Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select industry" /></SelectTrigger>
              <SelectContent>
                {industries.map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Domain *</Label>
            <Select value={form.domain ? String(form.domain) : ''} onValueChange={(v) => setIfPresent('domain', Number(v))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select domain" /></SelectTrigger>
              <SelectContent>
                {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Division</Label>
            <Input value={form.division} onChange={(e) => set('division', e.target.value)} placeholder="e.g. West" />
          </div>

          {canAssignOwner && (
            <div className="flex flex-col gap-1.5">
              <Label>Assigned to{ownerRequired ? ' *' : ''}</Label>
              <Select value={form.assigned_to ? String(form.assigned_to) : ''} onValueChange={(v) => setIfPresent('assigned_to', Number(v))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}{o.id === user?.id ? ' (self)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The person actively working this lead. Assigning it starts the workflow.</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Scope</Label>
            <Textarea rows={3} value={form.scope} onChange={(e) => set('scope', e.target.value)} placeholder="Describe what's in scope for this engagement…" />
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
