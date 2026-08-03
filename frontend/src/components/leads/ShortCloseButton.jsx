import { useState } from 'react'
import { toast } from 'sonner'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useShortCloseLead } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'

// Short-close (PRD §5.12 / TR §9.2) — the Resource Manager's escape hatch to
// Project Closure, with its compulsory remark. Rendered on two surfaces (user,
// 2026-07-30: "i cant see anywhere"): the Lead Detail header, next to Hold/Drop,
// and the Resource module's allocation queue, on each project group header —
// so the role never has to leave its own module to reach it.
//
// Renders nothing at all unless the viewer is a Resource Manager *and* the
// backend says the action is currently available (`can_short_close` — from
// Task 20 Implementation onward, until Project Closure is reached). Both halves
// of that gate are the caller's data; the component never guesses.
export function ShortCloseButton({ leadId, canShortClose, size, className, label = 'Short-close' }) {
  const { user } = useAuth()
  const shortCloseLead = useShortCloseLead()
  const [open, setOpen] = useState(false)
  const [remark, setRemark] = useState('')

  if (!PERMISSIONS.shortCloseLead(user) || !canShortClose) return null

  function handleConfirm() {
    const text = remark.trim()
    if (!text) return
    shortCloseLead.mutate(
      { id: leadId, remark: text },
      {
        onSuccess: () => {
          toast.success('Project short-closed; closure task opened')
          setOpen(false)
          setRemark('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className ?? 'text-blue-600 hover:text-blue-700'}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        <XCircle className="size-4" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Short-close project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This opens Project Closure right away — any task still open, on hold, or waiting on a date trigger is skipped. The project still runs through Closure and Accounts Approval and ends <span className="font-medium text-foreground">Completed</span>. This cannot be undone.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="short-close-remark">Remark (required)</Label>
            <Textarea
              id="short-close-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Why is this project being short-closed?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={shortCloseLead.isPending || !remark.trim()}
            >
              Short-close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
