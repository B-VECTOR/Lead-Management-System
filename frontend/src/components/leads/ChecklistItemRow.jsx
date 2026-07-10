import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChecklistItemBadge } from '@/components/shared/StatusBadge'
import { useUpdateChecklistItem } from '@/hooks/useTasks'
import { formatDateTime } from '@/lib/format'

// Backend checklist item (Tech Req §4.5): two editable fields — status
// (not_started / inprogress / complete) and remark — saved independently of
// task closure via its own request. The checkbox is a shortcut for
// complete⇄not_started; the Edit dialog exposes the full 3-state status.
const ITEM_STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'inprogress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
]

function EditDialog({ item, canEdit, onSave, saving }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(item.status)
  const [remark, setRemark] = useState(item.remark || '')

  function handleOpenChange(next) {
    if (next) {
      setStatus(item.status)
      setRemark(item.remark || '')
    }
    setOpen(next)
  }

  async function handleSave() {
    await onSave({ status, remark })
    toast.success('Checklist item updated')
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button" size="icon-sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground"
        disabled={!canEdit} title="Edit" onClick={() => handleOpenChange(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update checklist item</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">{item.item_key} {item.item_label}</p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Remark</label>
              <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add a remark for this item…" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ChecklistItemRow({ item, canEdit, leadId }) {
  const updateItem = useUpdateChecklistItem(leadId)
  const isComplete = item.status === 'complete'

  function handleCheckedChange(checked) {
    updateItem.mutate({ itemId: item.id, patch: { status: checked ? 'complete' : 'not_started' } })
  }

  function handleEditSave(patch) {
    return updateItem.mutateAsync({ itemId: item.id, patch })
  }

  return (
    <div className={`flex items-start justify-between gap-3 rounded-md border p-3 ${isComplete ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <Checkbox
          checked={isComplete}
          disabled={!canEdit || updateItem.isPending}
          onCheckedChange={handleCheckedChange}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="text-muted-foreground">{item.item_key}</span> {item.item_label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ChecklistItemBadge status={item.status} />
            {item.remark && <span className="truncate text-xs text-muted-foreground">“{item.remark}”</span>}
            {item.last_edited_by_name && item.last_edited_at && (
              <span className="text-xs text-muted-foreground">
                by {item.last_edited_by_name} on {formatDateTime(item.last_edited_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      <EditDialog item={item} canEdit={canEdit} onSave={handleEditSave} saving={updateItem.isPending} />
    </div>
  )
}
