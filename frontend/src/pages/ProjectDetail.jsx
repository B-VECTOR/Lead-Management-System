import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Bell, Check, Paperclip, UserCog, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProjectStatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { useProject, useUpdateProject, useAssignProject } from '@/hooks/useProjects'
import { useProjectTasks, useProjectChecklist, useUpdateChecklistItem } from '@/hooks/useChecklist'
import { useLead } from '@/hooks/useLeads'
import { useCompany } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { useAttachments, useUploadAttachment } from '@/hooks/useAttachments'
import { useActivitiesForProject } from '@/hooks/useActivities'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { PROJECT_STATUSES } from '@/mocks/seed'
import { formatDate, formatDateTime } from '@/lib/format'
import { projectProgress } from '@/api/projects'

function ChecklistItemRow({ item, canUpdate, projectId }) {
  const updateItem = useUpdateChecklistItem(projectId)
  const uploadAttachment = useUploadAttachment('checklist_item', item.id)
  const { data: files = [] } = useAttachments('checklist_item', item.id)

  const isDone = item.state === 'done'
  const isNA = item.state === 'na'
  const fileSatisfied = !item.requires_file || files.length > 0

  function setState(state) {
    updateItem.mutate({ id: item.id, patch: { state } })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadAttachment.mutateAsync(file)
    toast.success('File attached')
    e.target.value = ''
  }

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-3 ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : isNA ? 'bg-muted/50' : ''}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isDone}
          disabled={!canUpdate || (item.requires_file && !fileSatisfied && !isDone)}
          onCheckedChange={(checked) => setState(checked ? 'done' : 'open')}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isDone ? 'line-through text-muted-foreground' : isNA ? 'text-muted-foreground' : ''}`}>{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.requires_file && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> File required</Badge>}
            {item.notify && <Badge variant="outline" className="gap-1"><Bell className="size-3" /> Notifies</Badge>}
            {isNA && <Badge variant="secondary">N/A</Badge>}
            {item.done_at && <span className="text-xs text-muted-foreground">Done {formatDate(item.done_at)}</span>}
          </div>
        </div>
        {canUpdate && !isDone && (
          <Button variant="ghost" size="sm" onClick={() => setState(isNA ? 'open' : 'na')} className="shrink-0 text-xs text-muted-foreground">
            {isNA ? <><Undo2 className="size-3.5" /> Undo</> : 'Mark N/A'}
          </Button>
        )}
      </div>

      {item.requires_file && canUpdate && !isNA && (
        <div className="ml-7 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3" /> {f.filename}
            </div>
          ))}
          <Label htmlFor={`file-${item.id}`} className="w-fit cursor-pointer text-xs text-primary hover:underline">
            {files.length ? 'Upload another file' : 'Upload required file'}
          </Label>
          <input id={`file-${item.id}`} type="file" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: project, isLoading } = useProject(id)
  const { data: lead } = useLead(project?.lead_id)
  const { data: company } = useCompany(lead?.company_id)
  const { data: tasks = [] } = useProjectTasks(id)
  const { data: items = [] } = useProjectChecklist(id)
  const { data: users = [] } = useUsers()
  const { data: activities = [] } = useActivitiesForProject(id)
  const { data: attachments = [] } = useAttachments('project', id)

  const updateProject = useUpdateProject()
  const assignProject = useAssignProject()
  const uploadAttachment = useUploadAttachment('project', id)

  const [assignOpen, setAssignOpen] = useState(false)
  const [newAssignee, setNewAssignee] = useState('')

  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const reps = useMemo(() => users.filter((u) => u.role === 'Representative'), [users])

  if (isLoading || !project || !lead) return <div className="text-sm text-muted-foreground">Loading project…</div>

  const canUpdate = PERMISSIONS.updateChecklistItem(user, project)
  const progress = projectProgress(id)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadAttachment.mutateAsync(file)
    toast.success('File uploaded')
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground" onClick={() => navigate(`/leads/${lead.id}`)}>
            <ArrowLeft className="size-4" /> Back to {company?.name || lead.code}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {PERMISSIONS.assignTasks(user, lead) && (
            <Select value={project.status} onValueChange={(v) => updateProject.mutate({ id, patch: { status: v } })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {PERMISSIONS.assignTasks(user, lead) && (
            <Button variant="outline" onClick={() => { setNewAssignee(project.assigned_to || ''); setAssignOpen(true) }}>
              <UserCog className="size-4" /> Reassign
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center justify-between p-4">
          <div><p className="text-xs text-muted-foreground">Progress</p><p className="text-xl font-semibold">{progress}%</p></div>
          <ProgressRing value={progress} size={44} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Assigned to</p>
          <div className="mt-1"><UserChip user={userById[project.assigned_to]} size="md" /></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Timeline</p>
          <p className="text-sm font-medium">{formatDate(project.start_date)} → {formatDate(project.target_date)}</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Checklist</h2>
          {tasks.map((task) => {
            const taskItems = items.filter((i) => i.project_task_id === task.id).sort((a, b) => a.order - b.order)
            return (
              <Card key={task.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{task.name}</CardTitle>
                    <ProjectStatusBadge status={task.status} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {taskItems.map((item) => (
                    <ChecklistItemRow key={item.id} item={item} canUpdate={canUpdate} projectId={id} />
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Files</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Label htmlFor="project-file" className="cursor-pointer">
                <div className="flex w-fit items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-accent">
                  <Paperclip className="size-4" /> Upload a file
                </div>
              </Label>
              <input id="project-file" type="file" className="hidden" onChange={handleFileChange} />
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                  <span className="flex items-center gap-1.5"><Paperclip className="size-3" /> {a.filename}</span>
                  <span className="text-muted-foreground">{formatDate(a.uploaded_at)}</span>
                </div>
              ))}
              {attachments.length === 0 && <p className="text-sm text-muted-foreground">No project-level files yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
              {activities.map((a) => (
                <div key={a.id} className="text-xs">
                  <p>{a.summary}</p>
                  <p className="text-muted-foreground">{userById[a.created_by]?.name} · {formatDateTime(a.created_at)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign project</DialogTitle></DialogHeader>
          <Select value={newAssignee} onValueChange={setNewAssignee}>
            <SelectTrigger><SelectValue placeholder="Select a rep" /></SelectTrigger>
            <SelectContent>{reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => { assignProject.mutate({ id, assignedTo: newAssignee }); setAssignOpen(false); toast.success('Project reassigned') }} disabled={!newAssignee}>
              <Check className="size-4" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
