import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Paperclip, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateChecklistItem, useUpdateChecklistItemNotes } from '@/hooks/useChecklist'
import { useAttachments, useUploadAttachment } from '@/hooks/useAttachments'
import { CHECKLIST_ITEM_STATUSES } from '@/mocks/seed'
import { formatDate } from '@/lib/format'

// Files live behind a compact CTA instead of an always-visible upload strip —
// the trigger shows a count once something's attached, and upload is a real
// button (not a text link) inside the popover.
function FilesPopover({ item, canUpdate }) {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef(null)
  const uploadAttachment = useUploadAttachment('checklist_item', item.id)
  const { data: files = [] } = useAttachments('checklist_item', item.id)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadAttachment.mutateAsync({ file })
    toast.success('File attached')
    e.target.value = ''
  }

  const label = files.length ? `Files (${files.length})` : item.requires_file ? 'Attach required file' : 'Attach file'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={files.length ? 'secondary' : 'outline'} className="gap-1.5">
          <Paperclip className="size-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2" align="start">
        {files.length === 0 && <p className="text-xs text-muted-foreground">No files attached yet.</p>}
        {files.map((f) => (
          <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-xs hover:underline">
            <Paperclip className="size-3 shrink-0 text-muted-foreground" /> {f.filename}
          </a>
        ))}
        {canUpdate && (
          <>
            <Button type="button" size="sm" variant="outline" className="mt-1 w-fit" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="size-3.5" /> {files.length ? 'Upload another file' : 'Upload file'}
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Same CTA pattern for notes — draft in the popover, nothing written back
// until "Save" so it's unambiguous when a note actually gets submitted.
function NotesPopover({ item, canUpdate, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(item.notes || '')
  const hasNote = !!item.notes

  function handleOpenChange(next) {
    if (next) setDraft(item.notes || '')
    setOpen(next)
  }

  async function handleSave() {
    await onSave(draft)
    toast.success('Note saved')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant={hasNote ? 'secondary' : 'outline'} className="gap-1.5">
          <StickyNote className="size-3.5" /> {hasNote ? 'Note' : 'Add note'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2" align="start">
        {canUpdate ? (
          <>
            <Textarea
              rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a note for this item…" className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={draft === (item.notes || '')}>Save</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{item.notes || 'No note added.'}</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function ChecklistItemRow({ item, canUpdate, leadId }) {
  const updateItem = useUpdateChecklistItem(leadId)
  const updateNotes = useUpdateChecklistItemNotes(leadId)
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

  function handleSaveNote(notes) {
    return updateNotes.mutateAsync({ id: item.id, notes })
  }

  return (
    <div className={`flex flex-col gap-2.5 rounded-md border p-3 ${isDone ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : isNA ? 'bg-muted/50' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isDone ? 'line-through text-muted-foreground' : isNA ? 'text-muted-foreground' : ''}`}>{item.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.requires_file && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> File required</Badge>}
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

      {!isNA && (
        <div className="flex flex-wrap items-center gap-2">
          <FilesPopover item={item} canUpdate={canUpdate} />
          {(canUpdate || item.notes) && <NotesPopover item={item} canUpdate={canUpdate} onSave={handleSaveNote} />}
        </div>
      )}
    </div>
  )
}
