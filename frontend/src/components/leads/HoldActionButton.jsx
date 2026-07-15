import { useState } from 'react'
import { PauseCircle, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// A Hold / Unhold (Resume) control that first opens a small dialog for an
// optional remark. The remark is recorded on the lead/task activity log so the
// feed shows who paused/resumed and why (#1). `onConfirm(remark)` runs the
// actual hold/unhold mutation.
export function HoldActionButton({ isHeld, onConfirm, pending, size = 'default', noun = 'lead' }) {
  const [open, setOpen] = useState(false)
  const [remark, setRemark] = useState('')

  function handleConfirm() {
    onConfirm(remark.trim())
    setOpen(false)
    setRemark('')
  }

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => setOpen(true)} disabled={pending}>
        {isHeld ? <><PlayCircle className="size-4" /> Unhold</> : <><PauseCircle className="size-4" /> Hold</>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isHeld ? `Resume ${noun}` : `Hold ${noun}`}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hold-remark">Remark (optional)</Label>
            <Textarea
              id="hold-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder={isHeld ? 'Reason for resuming…' : 'Reason for putting on hold…'}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleConfirm} disabled={pending}>
              {isHeld ? 'Resume' : 'Hold'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
