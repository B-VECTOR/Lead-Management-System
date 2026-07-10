import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useFollowupUpdates, useAddFollowupUpdate, useCloseFollowup } from '@/hooks/useFollowups'
import { useAuth } from '@/context/AuthContext'
import { hasRole } from '@/api/scope'
import { initials, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// Update-status dialog for a single follow-up — a chat-style comment thread
// (oldest on top, newest at the bottom) plus a terminal "close" action. Shared
// between the "Other Tasks" screen and a lead's own Follow Up tab. Edit rights
// (comment / close) belong to the follow-up's creator, its assignee, or a Lead
// Admin — mirroring the backend can_edit_followup rule.
export function FollowupUpdateDialog({ followup, onClose }) {
  const { user: currentUser } = useAuth()
  const { data: updates = [], isLoading } = useFollowupUpdates(followup?.id)
  const addUpdate = useAddFollowupUpdate(followup?.id)
  const closeFollowup = useCloseFollowup(followup?.id)
  const [comment, setComment] = useState('')
  const threadRef = useRef(null)

  useEffect(() => {
    if (!threadRef.current) return
    threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [updates.length])

  if (!followup) return null
  const isClosed = followup.status === 'done'
  const canManage =
    !!currentUser &&
    (followup.assigned_to === currentUser.id ||
      followup.created_by === currentUser.id ||
      hasRole(currentUser, 'Lead Admin'))

  async function handleSaveComment() {
    if (!comment.trim()) return
    await addUpdate.mutateAsync(comment.trim())
    setComment('')
    toast.success('Comment saved')
  }

  async function handleCloseFollowup() {
    await closeFollowup.mutateAsync(comment.trim())
    setComment('')
    toast.success('Follow-up closed')
    onClose()
  }

  return (
    <Dialog open={!!followup} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{followup.title}</DialogTitle>
        </DialogHeader>
        {followup.remark && <p className="text-sm text-muted-foreground">{followup.remark}</p>}
        <div ref={threadRef} className="flex max-h-72 flex-col gap-3 overflow-y-auto px-0.5 py-1">
          {isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
          {!isLoading && updates.length === 0 && <p className="text-sm text-muted-foreground">No comments yet — be the first to leave one.</p>}
          {updates.map((u) => {
            const isMe = u.author === currentUser?.id
            return (
              <div key={u.id} className={cn('flex max-w-[85%] items-start gap-2', isMe ? 'ml-auto flex-row-reverse self-end' : 'mr-auto')}>
                <Avatar size="sm" className="mt-0.5 shrink-0">
                  <AvatarFallback>{initials(u.author_name)}</AvatarFallback>
                </Avatar>
                <div className={cn('rounded-2xl px-3 py-2 text-sm', isMe ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted')}>
                  <p className={cn('text-xs font-medium', isMe ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{u.author_name || 'Unknown'}</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{u.comment}</p>
                  <p className={cn('mt-1 text-right text-[10px]', isMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{formatDateTime(u.created_at)}</p>
                </div>
              </div>
            )
          })}
        </div>

        {isClosed ? (
          <p className="text-sm text-muted-foreground">This follow-up is closed.</p>
        ) : canManage ? (
          <>
            <Textarea
              rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment for whoever picks this up next…"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseFollowup} disabled={closeFollowup.isPending} className="sm:mr-auto">
                Close follow-up
              </Button>
              <Button type="button" onClick={handleSaveComment} disabled={!comment.trim() || addUpdate.isPending}>
                Save comment
              </Button>
            </DialogFooter>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">View only.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
