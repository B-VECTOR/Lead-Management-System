import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, personName } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import { useAddLeadComment, useLeadComments } from '@/hooks/useLeadComments'

// The Lead Trail (R23-1, user 2026-08-05) — the running commentary on a lead,
// sitting directly beneath Scope on Lead Detail's Details tab, where the user
// asked for it.
//
// Not the chat-bubble layout `FollowupUpdateDialog` uses: this app's back-office
// readers are 40+/50+ and want plain dense rows they can scan (the same feedback
// that drove R22), and a lead's trail runs for the months the engagement lasts
// rather than the few turns a follow-up takes. So: one flat divided list, newest
// first, each entry stating who and when above what they said.
//
// There is no permission prop. Server-side, visibility *is* the permission — if
// the lead loaded for this user, they may read the trail and add to it (the same
// rule a follow-up's thread uses). Everyone the workflow puts on the lead plus
// the Lead Admin is therefore covered without the frontend deciding anything.

function TrailEntry({ entry, currentUser }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">
          {personName(entry.author_name, currentUser, { id: entry.author, capitalize: true }) ||
            'Unknown'}
        </span>
        <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{entry.comment}</p>
    </div>
  )
}

export function LeadTrail({ leadId }) {
  const { user } = useAuth()
  const { data: entries = [], isLoading } = useLeadComments(leadId)
  const addComment = useAddLeadComment(leadId)
  const [comment, setComment] = useState('')

  async function handleAdd() {
    const text = comment.trim()
    if (!text) return
    try {
      await addComment.mutateAsync(text)
      setComment('')
      toast.success('Added to the lead trail')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader><CardTitle className="text-base">Lead Trail</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lead-trail-comment">Add a comment</Label>
          <Textarea
            id="lead-trail-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What should whoever picks this lead up next know?"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Kept with your name and the time. Comments can’t be edited or removed — the trail is
              the lead’s history.
            </p>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={handleAdd}
              disabled={!comment.trim() || addComment.isPending}
            >
              <MessageSquarePlus className="size-4" />
              {addComment.isPending ? 'Adding…' : 'Add to trail'}
            </Button>
          </div>
        </div>

        <div className="divide-y border-t pt-1">
          {isLoading && <p className="py-3 text-sm text-muted-foreground">Loading trail…</p>}
          {!isLoading && entries.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">
              Nothing on the trail yet — the first comment starts it.
            </p>
          )}
          {entries.map((entry) => (
            <TrailEntry key={entry.id} entry={entry} currentUser={user} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// The lead form's read-only shoulder-glance at the trail (R23-1d): the newest
// few entries above the form's own comment box, so nobody re-types a note that
// is already there. The full trail lives on the detail page.
export function LeadTrailRecent({ leadId, limit = 3 }) {
  const { user } = useAuth()
  const { data: entries = [] } = useLeadComments(leadId)
  if (entries.length === 0) return null

  return (
    <div className="flex flex-col divide-y rounded-md border bg-muted/30 px-3">
      {entries.slice(0, limit).map((entry) => (
        <TrailEntry key={entry.id} entry={entry} currentUser={user} />
      ))}
      {entries.length > limit && (
        <p className="py-2 text-xs text-muted-foreground">
          + {entries.length - limit} earlier{' '}
          {entries.length - limit === 1 ? 'comment' : 'comments'} — the full trail is on the lead’s
          detail page.
        </p>
      )}
    </div>
  )
}
