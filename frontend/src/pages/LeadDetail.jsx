import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Download, Eye, Info, Paperclip, PauseCircle, Pencil, Trash2, UserCog, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LeadStatusBadge, LeadTypeBadge } from '@/components/shared/StatusBadge'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { HoldActionButton } from '@/components/leads/HoldActionButton'
import { LeadTaskTab } from '@/components/leads/LeadTaskTab'
import { LeadFollowUpsTab } from '@/components/leads/LeadFollowUpsTab'
import { LeadResourcesTab } from '@/components/leads/LeadResourcesTab'
import { useLead, useDropLead, useAssignLeadOwner } from '@/hooks/useLeads'
import { useHoldLead, useUnholdLead } from '@/hooks/useHolds'
import { useActivitiesForLead } from '@/hooks/useActivities'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useAttachments'
import { useAssignableUsers } from '@/hooks/useLookups'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { formatDate, formatDateTime } from '@/lib/format'

// Every status transition now goes through a dedicated action (Tech Req §4.3.2
// v16): Hybernation/Complete are system-only, On Hold via the Hold button, and
// Dropped via the Drop button's popup (which captures the drop remark) — so
// the old status dropdown is gone.

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

  const { data: lead, isLoading, isError } = useLead(id)
  const { data: activities = [] } = useActivitiesForLead(id)
  const { data: attachments = [] } = useAttachments('lead', id)

  const dropLead = useDropLead()
  const assignOwner = useAssignLeadOwner()
  const holdLead = useHoldLead()
  const unholdLead = useUnholdLead()
  const uploadAttachment = useUploadAttachment('lead', id)
  const deleteAttachment = useDeleteAttachment('lead', id)

  const canReassignOwner = PERMISSIONS.reassignLeadOwner(user, lead)
  const { data: owners = [] } = useAssignableUsers(canReassignOwner)

  const [fileTitle, setFileTitle] = useState('')
  const [reassignOwnerOpen, setReassignOwnerOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')
  const [reassignRemark, setReassignRemark] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const [dropRemark, setDropRemark] = useState('')

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading lead…</div>
  if (isError || !lead) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">This lead doesn’t exist or you don’t have access to it.</p>
      </div>
    )
  }

  const canEdit = PERMISSIONS.editLead(user, lead)
  const canHold = PERMISSIONS.holdLead(user, lead)
  const canDrop = PERMISSIONS.dropLead(user, lead)
  const isHeld = lead.status === 'On Hold'
  const isDropped = lead.status === 'Dropped'

  function handleHoldToggle(remark) {
    const action = isHeld ? unholdLead : holdLead
    action.mutate(
      { leadId: id, remark },
      {
        onSuccess: () => toast.success(isHeld ? 'Lead resumed' : 'Lead put on hold'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  function handleDrop() {
    dropLead.mutate(
      { id, remark: dropRemark.trim() },
      {
        onSuccess: () => { toast.success('Lead dropped'); setDropOpen(false); setDropRemark('') },
        onError: (err) => toast.error(err.message),
      },
    )
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
            <h1 className="text-2xl font-semibold tracking-tight">{lead.project_name}</h1>
            <LeadStatusBadge status={lead.status} />
            <LeadTypeBadge type={lead.lead_type} />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{lead.lead_display_id}</span> · {lead.company_name} · {lead.country_name} · {lead.industry_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDrop && ['In Progress', 'On Hold'].includes(lead.status) && (
            <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setDropOpen(true)}>
              <XCircle className="size-4" /> Drop
            </Button>
          )}
          {canHold && (isHeld || lead.status === 'In Progress') && (
            <HoldActionButton
              isHeld={isHeld}
              noun="lead"
              pending={holdLead.isPending || unholdLead.isPending}
              onConfirm={handleHoldToggle}
            />
          )}
          {canEdit && !isHeld && (
            <Button variant="outline" onClick={() => navigate(`/leads/${id}/edit`)}><Pencil className="size-4" /> Edit</Button>
          )}
          {canReassignOwner && (
            <Button variant="outline" onClick={() => { setNewOwner(lead.assigned_to ? String(lead.assigned_to) : ''); setReassignOwnerOpen(true) }}>
              <UserCog className="size-4" /> {lead.assigned_to ? 'Change assigned to' : 'Assign to'}
            </Button>
          )}
        </div>
      </div>

      {isHeld && lead.active_hold && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <PauseCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              On hold{lead.active_hold.hold_by_name ? ` — by ${lead.active_hold.hold_by_name}` : ''}
              {lead.active_hold.hold_at ? ` on ${formatDateTime(lead.active_hold.hold_at)}` : ''}
            </p>
            {lead.active_hold.reason && <p className="mt-0.5">{lead.active_hold.reason}</p>}
          </div>
        </div>
      )}
      {isDropped && lead.drop_remark && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Dropped</p>
            <p className="mt-0.5">{lead.drop_remark}</p>
          </div>
        </div>
      )}
      {lead.short_close_info && (
        <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              Short-closed{lead.short_close_info.short_closed_by_name ? ` — by ${lead.short_close_info.short_closed_by_name}` : ''}
              {lead.short_close_info.short_closed_at ? ` on ${formatDateTime(lead.short_close_info.short_closed_at)}` : ''}
            </p>
            <p className="mt-0.5">
              Any tasks in progress were skipped; the project has moved directly to Project Closure.
            </p>
            {lead.short_close_info.remark && (
              <p className="mt-1"><span className="font-medium">Remark:</span> {lead.short_close_info.remark}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Overall progress</p>
            <p className="mt-1 text-sm font-medium">Tasks completed</p>
          </div>
          <ProgressRing value={lead.progress ?? 0} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Lead ID</p>
          <p className="mt-1 text-sm font-medium">{lead.lead_display_id}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Owner</p>
          <p className="mt-1 text-sm font-medium">{lead.created_by_name || '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Assigned to</p>
          <p className="mt-1 text-sm font-medium">{lead.assigned_to_name || 'Not assigned'}</p>
        </CardContent></Card>
        {lead.project_id && (
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Project ID</p>
            <p className="mt-1 text-sm font-medium">{lead.project_id}</p>
          </CardContent></Card>
        )}
      </div>

      <Tabs defaultValue="task">
        <TabsList>
          <TabsTrigger value="task">Task</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="followup">Follow Up</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="task">
          <LeadTaskTab leadId={id} />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">Auto-logged events on this lead.</p>
              <div className="flex flex-col gap-2">
                {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
                    <Badge variant="secondary" className="h-fit shrink-0">{a.type}</Badge>
                    <div className="min-w-0 flex-1">
                      <p>{a.summary}</p>
                      {a.body && <p className="mt-0.5 text-muted-foreground">“{a.body}”</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.actor_name ? `${a.actor_name} · ` : ''}{formatDateTime(a.created_at)}
                      </p>
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
                      <span className="mr-2 text-xs text-muted-foreground">{formatDate(a.uploaded_at)}</span>
                      <Button asChild variant="ghost" size="icon-sm" title="View">
                        <a href={a.url} target="_blank" rel="noopener noreferrer"><Eye className="size-4" /></a>
                      </Button>
                      <Button asChild variant="ghost" size="icon-sm" title="Download">
                        <a href={a.url} download={a.filename}><Download className="size-4" /></a>
                      </Button>
                      {PERMISSIONS.deleteAttachment(user, lead) && (
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
              <InfoRow label="Country" value={lead.country_name} />
              <InfoRow label="Industry" value={lead.industry_name} />
              <InfoRow label="Domain" value={lead.domain_name} />
              <InfoRow label="Division" value={lead.division || '—'} />
              <InfoRow label="Lead type" value={lead.lead_type} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Scope</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">{lead.scope || '—'}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <LeadFollowUpsTab leadId={id} />
        </TabsContent>

        <TabsContent value="resources">
          <LeadResourcesTab leadId={id} />
        </TabsContent>
      </Tabs>

      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dropping cancels the lead — its open tasks are marked dropped and the workflow stops. This cannot be undone from the app.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drop-remark">Remark (optional)</Label>
            <Textarea
              id="drop-remark"
              value={dropRemark}
              onChange={(e) => setDropRemark(e.target.value)}
              placeholder="Reason for dropping…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDropOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDrop} disabled={dropLead.isPending}>
              {dropLead.isPending ? 'Dropping…' : 'Drop lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOwnerOpen} onOpenChange={setReassignOwnerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{lead.assigned_to ? 'Change assigned to' : 'Assign to'}</DialogTitle></DialogHeader>
          <Select value={newOwner} onValueChange={(v) => v && setNewOwner(v)}>
            <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
            <SelectContent>
              {owners.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}{m.id === user?.id ? ' (self)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reassign-remark">Remark (optional)</Label>
            <Textarea
              id="reassign-remark"
              value={reassignRemark}
              onChange={(e) => setReassignRemark(e.target.value)}
              placeholder="Reason for the (re)assignment…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOwnerOpen(false)}>Cancel</Button>
            <Button
              disabled={!newOwner}
              onClick={() => {
                assignOwner.mutate(
                  { id, ownerId: Number(newOwner), remark: reassignRemark.trim() },
                  {
                    onSuccess: () => toast.success('Owner assigned'),
                    onError: (err) => toast.error(err.message),
                  },
                )
                setReassignRemark('')
                setReassignOwnerOpen(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
