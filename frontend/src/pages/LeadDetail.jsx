import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Download, Eye, Paperclip, Pencil, Archive, Trash2, UserCog, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LeadStatusBadge, PriorityBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { LeadTaskTab } from '@/components/leads/LeadTaskTab'
import { useLead, useUpdateLeadStatus, useAssignLeadOwner, useAssignLeadRep, useArchiveLead } from '@/hooks/useLeads'
import { useCompany } from '@/hooks/useCompanies'
import { useLeadTypes } from '@/hooks/useLeadTypes'
import { useActivitiesForLead, useLogActivity } from '@/hooks/useActivities'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { LEAD_STATUSES } from '@/mocks/seed'
import { formatDate, formatDateTime } from '@/lib/format'
import { leadProgress } from '@/api/checklist'

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
  const { data: leadTypes = [] } = useLeadTypes()
  const { data: activities = [] } = useActivitiesForLead(id)
  const { data: attachments = [] } = useAttachments('lead', id)
  const { data: users = [] } = useUsers()

  const updateStatus = useUpdateLeadStatus()
  const assignOwner = useAssignLeadOwner()
  const assignRep = useAssignLeadRep()
  const archiveLead = useArchiveLead()
  const logActivity = useLogActivity(id)
  const uploadAttachment = useUploadAttachment('lead', id)
  const deleteAttachment = useDeleteAttachment('lead', id)

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const managers = useMemo(() => users.filter((u) => u.role === 'Manager' || u.role === 'Admin'), [users])
  const reps = useMemo(() => users.filter((u) => u.role === 'Representative'), [users])
  const leadTypeName = useMemo(() => leadTypes.find((t) => t.id === lead?.lead_type_id)?.name, [leadTypes, lead])

  const [noteText, setNoteText] = useState('')
  const [fileTitle, setFileTitle] = useState('')
  const [reassignOwnerOpen, setReassignOwnerOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')
  const [reassignRepOpen, setReassignRepOpen] = useState(false)
  const [newRep, setNewRep] = useState('')

  if (isLoading || !lead) return <div className="text-sm text-muted-foreground">Loading lead…</div>

  const canEdit = PERMISSIONS.editLead(user, lead)
  const canUpdateChecklist = PERMISSIONS.updateChecklistItem(user, lead)
  const canAssign = PERMISSIONS.assignTasks(user, lead)
  const progress = leadProgress(id)

  function handleStatusChange(status) {
    if (status === lead.status) return
    updateStatus.mutate({ id, status }, { onSuccess: () => toast.success(`Status updated to ${status}`) })
  }

  async function handleAddNote() {
    if (!noteText.trim()) return
    await logActivity.mutateAsync({ type: 'Note', summary: noteText.slice(0, 80), body: noteText })
    setNoteText('')
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File is too large (max 5MB in this demo).')
      e.target.value = ''
      return
    }
    await uploadAttachment.mutateAsync({ file, title: fileTitle.trim() || null })
    toast.success('File uploaded')
    setFileTitle('')
    e.target.value = ''
  }

  function handleDeleteFile(attachmentId) {
    deleteAttachment.mutate(attachmentId, { onSuccess: () => toast.success('File deleted') })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" onClick={() => navigate('/leads')}>
            <ArrowLeft className="size-4" /> Back to leads
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name || lead.code}</h1>
            <LeadStatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
            {leadTypeName && <LeadTypeBadge type={leadTypeName} />}
          </div>
          <p className="text-sm text-muted-foreground">{company?.name} · {lead.code} · {lead.industry}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Select value={lead.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => navigate(`/leads/${id}/edit`)}><Pencil className="size-4" /> Edit</Button>
          )}
          {canAssign && (
            <Button variant="outline" onClick={() => { setNewRep(lead.assigned_to || ''); setReassignRepOpen(true) }}>
              <UsersRound className="size-4" /> {lead.assigned_to ? 'Reassign rep' : 'Assign rep'}
            </Button>
          )}
          {PERMISSIONS.reassignLeadOwner(user) && (
            <Button variant="outline" onClick={() => { setNewOwner(lead.owner_id); setReassignOwnerOpen(true) }}><UserCog className="size-4" /> Reassign owner</Button>
          )}
          {PERMISSIONS.archiveLead(user) && (
            <Button variant="outline" onClick={() => { archiveLead.mutate(id); toast.success('Lead archived'); navigate('/leads') }}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs text-muted-foreground">Progress</p><p className="text-xl font-semibold">{progress}%</p></div>
          <ProgressRing value={progress} size={44} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Assigned to</p>
          <div className="mt-1"><UserChip user={userById[lead.assigned_to]} size="md" /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Owner</p>
          <div className="mt-1"><UserChip user={userById[lead.owner_id]} size="md" /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Timeline</p>
          <p className="text-sm font-medium">{formatDate(lead.start_date)} → {formatDate(lead.target_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Next follow-up: {formatDate(lead.next_follow_up)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="task">
        <TabsList>
          <TabsTrigger value="task">Task</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="task">
          <LeadTaskTab leadId={id} canUpdate={canUpdateChecklist} />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Textarea placeholder="Log a call, meeting, or note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="flex-1" />
                <Button onClick={handleAddNote} disabled={!noteText.trim()}>Add</Button>
              </div>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardHeader><CardTitle className="text-base">Files</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lead-file-title">Title (optional)</Label>
                  <Input id="lead-file-title" value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} placeholder="e.g. Signed contract" className="w-56" />
                </div>
                <Label htmlFor="lead-file" className="cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent">
                    <Paperclip className="size-4" /> Choose file & upload
                  </div>
                </Label>
                <input id="lead-file" type="file" className="hidden" onChange={handleFileChange} />
              </div>
              <div className="flex flex-col gap-2">
                {attachments.length === 0 && <p className="text-sm text-muted-foreground">No files uploaded yet.</p>}
                {attachments.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Paperclip className="size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{a.title || a.filename}</p>
                        {a.title && <p className="text-xs text-muted-foreground">{a.filename}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-2 text-xs text-muted-foreground">{userById[a.uploaded_by]?.name} · {formatDate(a.uploaded_at)}</span>
                      <Button asChild variant="ghost" size="icon-sm" title="View">
                        <a href={a.url} target="_blank" rel="noopener noreferrer"><Eye className="size-4" /></a>
                      </Button>
                      <Button asChild variant="ghost" size="icon-sm" title="Download">
                        <a href={a.url} download={a.filename}><Download className="size-4" /></a>
                      </Button>
                      {PERMISSIONS.deleteAttachment(user) && (
                        <Button
                          variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" title="Delete"
                          onClick={() => handleDeleteFile(a.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Industry" value={lead.industry} />
              <InfoRow label="Domain" value={lead.domain} />
              <InfoRow label="Product modules" value={lead.product_modules?.length ? lead.product_modules.join(', ') : '—'} />
              <InfoRow label="Source" value={lead.source_detail} />
              <InfoRow label="Tags" value={lead.tags?.length ? lead.tags.join(', ') : '—'} />
              <InfoRow
                label="Conversion reminder"
                value={lead.conversion_reminder === 'mining' ? 'Convert to Mining' : lead.conversion_reminder === 'extension' ? 'Convert to Extension' : '—'}
              />
            </CardContent>
          </Card>
          <Card>
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
      </Tabs>

      <Dialog open={reassignOwnerOpen} onOpenChange={setReassignOwnerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign lead owner</DialogTitle></DialogHeader>
          <Select value={newOwner} onValueChange={setNewOwner}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOwnerOpen(false)}>Cancel</Button>
            <Button onClick={() => { assignOwner.mutate({ id, ownerId: newOwner }); setReassignOwnerOpen(false); toast.success('Owner reassigned') }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignRepOpen} onOpenChange={setReassignRepOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{lead.assigned_to ? 'Reassign representative' : 'Assign representative'}</DialogTitle></DialogHeader>
          <Select value={newRep} onValueChange={setNewRep}>
            <SelectTrigger><SelectValue placeholder="Select a rep" /></SelectTrigger>
            <SelectContent>{reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignRepOpen(false)}>Cancel</Button>
            <Button onClick={() => { assignRep.mutate({ id, assignedTo: newRep }); setReassignRepOpen(false); toast.success('Representative assigned') }} disabled={!newRep}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
