import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Paperclip, Pencil, Plus, Archive, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LeadStatusBadge, PriorityBadge, ProjectStatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { useLead, useUpdateLeadStatus, useAssignLeadOwner, useArchiveLead } from '@/hooks/useLeads'
import { useProjectsForLead, useCreateProject } from '@/hooks/useProjects'
import { useCompany, useCompanyContacts } from '@/hooks/useCompanies'
import { useActivitiesForLead, useLogActivity } from '@/hooks/useActivities'
import { useAttachments, useUploadAttachment } from '@/hooks/useAttachments'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { LEAD_STATUSES, LOST_REASONS } from '@/mocks/seed'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { projectProgress } from '@/api/projects'

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: lead, isLoading } = useLead(id)
  const { data: company } = useCompany(lead?.company_id)
  const { data: contacts = [] } = useCompanyContacts(lead?.company_id)
  const { data: projects = [] } = useProjectsForLead(id)
  const { data: activities = [] } = useActivitiesForLead(id)
  const { data: attachments = [] } = useAttachments('lead', id)
  const { data: users = [] } = useUsers()

  const updateStatus = useUpdateLeadStatus()
  const assignOwner = useAssignLeadOwner()
  const archiveLead = useArchiveLead()
  const logActivity = useLogActivity(id)
  const uploadAttachment = useUploadAttachment('lead', id)
  const createProject = useCreateProject(id)

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const managers = useMemo(() => users.filter((u) => u.role === 'Manager' || u.role === 'Admin'), [users])
  const reps = useMemo(() => users.filter((u) => u.role === 'Representative'), [users])

  const [statusDialog, setStatusDialog] = useState(null)
  const [lostReason, setLostReason] = useState('')
  const [wonNotes, setWonNotes] = useState('')
  const [noteText, setNoteText] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProject, setNewProject] = useState({ name: '', description: '', assigned_to: '', start_date: '', target_date: '' })

  if (isLoading || !lead) return <div className="text-sm text-muted-foreground">Loading lead…</div>

  const canEdit = PERMISSIONS.editLead(user, lead)

  function handleStatusChange(status) {
    if (status === lead.status) return
    if (status === 'Closed Lost' || status === 'Closed Won') {
      setStatusDialog(status)
      setLostReason('')
      setWonNotes('')
      return
    }
    updateStatus.mutate({ id, status }, { onSuccess: () => toast.success(`Status updated to ${status}`) })
  }

  function confirmStatusDialog() {
    if (statusDialog === 'Closed Lost' && !lostReason) return
    updateStatus.mutate(
      { id, status: statusDialog, extra: statusDialog === 'Closed Lost' ? { lost_reason: lostReason } : { won_notes: wonNotes } },
      { onSuccess: () => { toast.success(`Status updated to ${statusDialog}`); setStatusDialog(null) } }
    )
  }

  async function handleAddNote() {
    if (!noteText.trim()) return
    await logActivity.mutateAsync({ type: 'Note', summary: noteText.slice(0, 80), body: noteText })
    setNoteText('')
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadAttachment.mutateAsync(file)
    toast.success('File uploaded')
    e.target.value = ''
  }

  async function handleCreateProject() {
    await createProject.mutateAsync(newProject)
    toast.success('Project created from the lead type template')
    setNewProjectOpen(false)
    setNewProject({ name: '', description: '', assigned_to: '', start_date: '', target_date: '' })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" onClick={() => navigate('/leads')}>
            <ArrowLeft className="size-4" /> Back to leads
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              <Link to={`/companies/${company?.id}`} className="hover:underline">{company?.name}</Link>
            </h1>
            <LeadStatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
          </div>
          <p className="text-sm text-muted-foreground">{lead.code} · {lead.industry}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Select value={lead.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/leads/${id}/edit`)}><Pencil className="size-4" /> Edit</Button>
          )}
          {PERMISSIONS.reassignLeadOwner(user) && (
            <Button variant="outline" onClick={() => { setNewOwner(lead.owner_id); setReassignOpen(true) }}><UserCog className="size-4" /> Reassign</Button>
          )}
          {PERMISSIONS.archiveLead(user) && (
            <Button variant="outline" onClick={() => { archiveLead.mutate(id); toast.success('Lead archived'); navigate('/leads') }}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ACV</p>
            <p className="text-xl font-semibold">{formatCurrency(lead.acv, lead.currency)}</p>
            <p className="text-xs text-muted-foreground">{lead.plan} · {lead.seats} seats · {lead.billing_cycle}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Owner</p>
            <div className="mt-1"><UserChip user={userById[lead.owner_id]} size="md" /></div>
            <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(lead.created_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Expected close</p>
            <p className="text-xl font-semibold">{formatDate(lead.expected_close_date)}</p>
            <p className="text-xs text-muted-foreground">Next follow-up: {formatDate(lead.next_follow_up)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Industry" value={lead.industry} />
              <InfoRow label="Domain" value={lead.domain} />
              <InfoRow label="Product modules" value={lead.product_modules?.length ? lead.product_modules.join(', ') : '—'} />
              <InfoRow label="Source" value={lead.source_detail} />
              <InfoRow label="Tags" value={lead.tags?.length ? lead.tags.join(', ') : '—'} />
              {lead.status === 'Closed Lost' && <InfoRow label="Lost reason" value={lead.lost_reason} />}
              {lead.status === 'Closed Won' && <InfoRow label="Won notes" value={lead.won_notes} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Commercials</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Plan" value={lead.plan} />
              <InfoRow label="Seats" value={lead.seats} />
              <InfoRow label="Contract length" value={lead.contract_length ? `${lead.contract_length} months` : null} />
              <InfoRow label="Probability" value={lead.probability != null ? `${lead.probability}%` : null} />
              <InfoRow label="Renewal date" value={formatDate(lead.renewal_date)} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Description & notes</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Requirement summary</p>
                <p className="text-sm">{lead.description || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Internal notes (not client-facing)</p>
                <p className="text-sm">{lead.internal_notes || '—'}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="flex flex-col gap-3">
          {PERMISSIONS.createProject(user, lead) && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setNewProjectOpen(true)}><Plus className="size-4" /> New project</Button>
            </div>
          )}
          {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <ProjectStatusBadge status={p.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Assigned to {userById[p.assigned_to]?.name || 'Unassigned'}</p>
                      <p className="text-xs text-muted-foreground">Target: {formatDate(p.target_date)}</p>
                    </div>
                    <ProgressRing value={projectProgress(p.id)} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="flex flex-col gap-3">
          <Card>
            <CardContent className="flex gap-2 p-3">
              <Textarea placeholder="Log a call, meeting, or note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="flex-1" />
              <Button onClick={handleAddNote} disabled={!noteText.trim()}>Add</Button>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
            {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            {activities.map((a) => (
              <div key={a.id} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
                <Badge variant="secondary" className="h-fit shrink-0">{a.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p>{a.summary}</p>
                  {a.body && <p className="mt-0.5 text-muted-foreground">{a.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{userById[a.created_by]?.name} · {formatDateTime(a.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="flex flex-col gap-3">
          {contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts recorded for this company.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {contacts.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{c.name}</p>
                    {c.is_primary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.title}</p>
                  <p className="mt-1 text-sm">{c.email}</p>
                  <p className="text-sm">{c.phone}</p>
                  <Badge className="mt-2" variant="outline">{c.decision_role}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="files" className="flex flex-col gap-3">
          <div>
            <Label htmlFor="lead-file" className="cursor-pointer">
              <div className="flex w-fit items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent">
                <Paperclip className="size-4" /> Upload a file
              </div>
            </Label>
            <input id="lead-file" type="file" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="flex flex-col gap-2">
            {attachments.length === 0 && <p className="text-sm text-muted-foreground">No files uploaded yet.</p>}
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Paperclip className="size-4 text-muted-foreground" />
                  {a.filename}
                </div>
                <span className="text-xs text-muted-foreground">{userById[a.uploaded_by]?.name} · {formatDate(a.uploaded_at)}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!statusDialog} onOpenChange={(open) => !open && setStatusDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{statusDialog === 'Closed Lost' ? 'Mark as Closed Lost' : 'Mark as Closed Won'}</DialogTitle></DialogHeader>
          {statusDialog === 'Closed Lost' ? (
            <div className="flex flex-col gap-1.5">
              <Label>Lost reason *</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Won notes</Label>
              <Textarea value={wonNotes} onChange={(e) => setWonNotes(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button>
            <Button onClick={confirmStatusDialog} disabled={statusDialog === 'Closed Lost' && !lostReason}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign lead owner</DialogTitle></DialogHeader>
          <Select value={newOwner} onValueChange={setNewOwner}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button onClick={() => { assignOwner.mutate({ id, ownerId: newOwner }); setReassignOpen(false); toast.success('Owner reassigned') }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Project name *</Label>
              <Input value={newProject.name} onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Pilot rollout — HR dept" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea value={newProject.description} onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Assign to (Representative)</Label>
              <Select value={newProject.assigned_to} onValueChange={(v) => setNewProject((p) => ({ ...p, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a rep" /></SelectTrigger>
                <SelectContent>{reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Start date</Label>
                <Input type="date" value={newProject.start_date} onChange={(e) => setNewProject((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Target date</Label>
                <Input type="date" value={newProject.target_date} onChange={(e) => setNewProject((p) => ({ ...p, target_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={!newProject.name || createProject.isPending}>Create project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
