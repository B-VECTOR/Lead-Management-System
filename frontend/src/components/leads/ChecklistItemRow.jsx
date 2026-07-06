import { useState } from 'react'
import { toast } from 'sonner'
import { Lock, Paperclip, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChecklistStatusBadge } from '@/components/shared/StatusBadge'
import { useUpdateChecklistItem } from '@/hooks/useChecklist'
import { useAttachments } from '@/hooks/useAttachments'
import { CHECKLIST_ITEM_STATUSES } from '@/mocks/seed'
import { formatDateTime } from '@/lib/format'

// The Edit dialog is the only place status and remarks can be changed —
// status is otherwise shown read-only on the row (a plain badge). Files
// already attached still show here read-only; uploading isn't available.
function EditDialog({ item, canUpdate, files, fileSatisfied, onSave }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(item.state)
  const [remark, setRemark] = useState(item.notes || '')

  function handleOpenChange(next) {
    if (next) {
      setStatus(item.state)
      setRemark(item.notes || '')
    }
    setOpen(next)
  }

  async function handleSave() {
    if (status === 'done' && item.requires_file && !fileSatisfied) {
      toast.error('Upload the required file before marking this complete.')
      return
    }
    await onSave({ state: status, notes: remark })
    toast.success('Checklist item updated')
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button" size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground"
        disabled={!canUpdate} title="Edit" onClick={() => handleOpenChange(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update checklist item</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">{item.label}</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHECKLIST_ITEM_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} disabled={s.value === 'done' && item.requires_file && !fileSatisfied}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Remark</label>
              <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a remark for this item…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Files{item.requires_file ? ' (required before Completed)' : ''}</label>
              {files.length === 0 && <p className="text-xs text-muted-foreground">No files attached yet.</p>}
              {files.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-xs hover:underline">
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" /> {f.filename}
                </a>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ChecklistItemRow({ item, canUpdate, leadId, locked, userById }) {
  const updateItem = useUpdateChecklistItem(leadId)
  const { data: files = [] } = useAttachments('checklist_item', item.id)

  const isDone = item.state === 'done'
  const isNA = item.state === 'na'
  const fileSatisfied = !item.requires_file || files.length > 0
  const canInteract = canUpdate && !locked

  function handleCheckedChange(checked) {
    if (checked && item.requires_file && !fileSatisfied) {
      toast.error('Upload the required file before marking this complete.')
      return
    }
    updateItem.mutate({ id: item.id, patch: { state: checked ? 'done' : 'open' } })
  }

  function handleEditSave(patch) {
    return updateItem.mutateAsync({ id: item.id, patch })
  }

  const completedByName = item.done_by ? userById?.[item.done_by]?.name || 'someone' : null

  return (
    <div className={`flex items-start justify-between gap-3 rounded-md border p-3 ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : isNA ? 'bg-muted/50' : locked ? 'opacity-60' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <Checkbox
          checked={isDone}
          disabled={!canInteract}
          onCheckedChange={handleCheckedChange}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isNA ? 'text-muted-foreground' : ''}`}>{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ChecklistStatusBadge status={item.state} />
            {item.requires_file && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> File required</Badge>}
            {files.length > 0 && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> {files.length}</Badge>}
            {completedByName && item.done_at && (
              <span className="text-xs text-muted-foreground">
                {isNA ? 'Marked N/A' : 'Completed'} by {completedByName} on {formatDateTime(item.done_at)}
              </span>
            )}
            {locked && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" /> Complete previous items first
              </span>
            )}
          </div>
        </div>
      </div>

      <EditDialog
        item={item}
        canUpdate={canInteract}
        files={files}
        fileSatisfied={fileSatisfied}
        onSave={handleEditSave}
      />
    </div>
  )
}
