import { toast } from 'sonner'
import { Bell, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateChecklistItem } from '@/hooks/useChecklist'
import { useAttachments, useUploadAttachment } from '@/hooks/useAttachments'
import { CHECKLIST_ITEM_STATUSES } from '@/mocks/seed'
import { formatDate } from '@/lib/format'

export function ChecklistItemRow({ item, canUpdate, leadId }) {
  const updateItem = useUpdateChecklistItem(leadId)
  const uploadAttachment = useUploadAttachment('checklist_item', item.id)
  const { data: files = [] } = useAttachments('checklist_item', item.id)

  const isDone = item.state === 'done'
  const isNA = item.state === 'na'
  const fileSatisfied = !item.requires_file || files.length > 0

  function setState(state) {
    if (state === 'done' && item.requires_file && !fileSatisfied) {
      toast.error('Upload the required file before marking this complete.')
      return
    }
    updateItem.mutate({ id: item.id, patch: { state } })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadAttachment.mutateAsync({ file })
    toast.success('File attached')
    e.target.value = ''
  }

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-3 ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : isNA ? 'bg-muted/50' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isDone ? 'line-through text-muted-foreground' : isNA ? 'text-muted-foreground' : ''}`}>{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.requires_file && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> File required</Badge>}
            {item.notify && <Badge variant="outline" className="gap-1"><Bell className="size-3" /> Notifies</Badge>}
            {item.done_at && <span className="text-xs text-muted-foreground">Updated {formatDate(item.done_at)}</span>}
          </div>
        </div>
        <Select value={item.state} onValueChange={setState} disabled={!canUpdate}>
          <SelectTrigger className="w-full sm:w-36 sm:shrink-0" size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHECKLIST_ITEM_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value} disabled={s.value === 'done' && item.requires_file && !fileSatisfied}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {item.requires_file && canUpdate && !isNA && (
        <div className="ml-0 flex flex-col gap-1.5">
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
