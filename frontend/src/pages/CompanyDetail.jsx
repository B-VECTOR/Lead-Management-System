import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LeadStatusBadge } from '@/components/shared/StatusBadge'
import { useCompany, useCompanyContacts, useCompanyLeads, useCreateContact } from '@/hooks/useCompanies'
import { useProjects } from '@/hooks/useProjects'
import { formatCompactCurrency, formatDate } from '@/lib/format'

const DECISION_ROLES = ['Decision maker', 'Influencer', 'Technical', 'Procurement', 'User']

export default function CompanyDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: company, isLoading } = useCompany(id)
  const { data: contacts = [] } = useCompanyContacts(id)
  const { data: leads = [] } = useCompanyLeads(id)
  const { data: projects = [] } = useProjects()
  const createContact = useCreateContact(id)

  const [contactOpen, setContactOpen] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', decision_role: 'User', is_primary: false })

  const firstProjectByLead = useMemo(() => {
    const map = {}
    for (const p of projects) if (!map[p.lead_id]) map[p.lead_id] = p
    return map
  }, [projects])

  if (isLoading || !company) return <div className="text-sm text-muted-foreground">Loading company…</div>

  async function handleCreateContact() {
    await createContact.mutateAsync(form)
    setContactOpen(false)
    setForm({ name: '', title: '', email: '', phone: '', decision_role: 'User', is_primary: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" onClick={() => navigate('/companies')}>
          <ArrowLeft className="size-4" /> Back to companies
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline">{company.industry}</Badge>
          <Badge variant="outline">{company.size}</Badge>
          <span className="text-sm text-muted-foreground">{company.location}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Lead history ({leads.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-col divide-y">
            {leads.length === 0 && <p className="text-sm text-muted-foreground">No leads for this company yet.</p>}
            {leads.map((l) => (
              <Link key={l.id} to={`/leads/${l.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-accent/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.code} · {firstProjectByLead[l.id]?.name || 'No project yet'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm tabular-nums">{formatCompactCurrency(l.acv, l.currency)}</span>
                  <LeadStatusBadge status={l.status} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Contacts</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setContactOpen(true)}><Plus className="size-4" /></Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts yet.</p>}
            {contacts.map((c) => (
              <div key={c.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.name}</p>
                  {c.is_primary && <Badge variant="secondary">Primary</Badge>}
                </div>
                <p className="text-muted-foreground">{c.title}</p>
                <p>{c.email}</p>
                <Badge variant="outline" className="mt-1">{c.decision_role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New contact</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Decision role</Label>
              <Select value={form.decision_role} onValueChange={(v) => setForm((f) => ({ ...f, decision_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DECISION_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateContact} disabled={!form.name}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
