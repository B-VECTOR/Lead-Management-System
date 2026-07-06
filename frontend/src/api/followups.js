import { getAll, insert, update, genId, peek } from '../mocks/db'
import { visibleLeadIds } from './scope'
import { notify } from './notifications'

export async function listFollowups(currentUser, filters = {}) {
  const rows = await getAll('followups')
  const leadIds = visibleLeadIds(currentUser)
  // leadIds === null only for BD Admin (global, read-only visibility, §2.1) —
  // everyone else is scoped to follow-ups on a lead they can see, or ad-hoc
  // ones (no lead) assigned directly to them.
  let visible = rows.filter((f) => {
    if (leadIds === null) return true
    if (f.lead_id) return leadIds.has(f.lead_id)
    return f.assigned_to === currentUser.id
  })
  if (filters.leadId) visible = visible.filter((f) => f.lead_id === filters.leadId)
  if (filters.assignedToMe) visible = visible.filter((f) => f.assigned_to === currentUser.id)
  if (filters.overdueOnly) visible = visible.filter((f) => !f.done && new Date(f.due_date) < new Date())
  return visible.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
}

export async function createFollowup(data, currentUser) {
  const row = {
    id: genId('f'), lead_id: data.lead_id || null,
    title: data.title, due_date: data.due_date, assigned_to: data.assigned_to,
    done: false, reminder_at: data.reminder_at || null,
  }
  const created = await insert('followups', row)
  if (data.assigned_to !== currentUser.id) {
    await notify({ user_id: data.assigned_to, type: 'followup', message: `New follow-up: ${row.title}`, link: `/leads/${row.lead_id}` })
  }
  return created
}

// Comment-thread history on a follow-up (the "Update status" dialog) — oldest
// first, chat-style: the first comment stays on top, newest comments append
// at the bottom.
export async function listFollowupUpdates(followupId) {
  const rows = await getAll('followupUpdates')
  return rows.filter((u) => u.followup_id === followupId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
}

export async function addFollowupUpdate(followupId, comment, currentUser) {
  return insert('followupUpdates', {
    id: genId('fu'), followup_id: followupId, author_id: currentUser.id,
    comment, created_at: new Date().toISOString(),
  })
}

// Terminal action — logs a closing comment (if provided) and marks the
// follow-up done. Once closed, the UI stops offering further comments.
export async function closeFollowup(followupId, comment, currentUser) {
  if (comment && comment.trim()) {
    await addFollowupUpdate(followupId, comment.trim(), currentUser)
  }
  return update('followups', followupId, { done: true })
}

// Synchronous helper (no simulated latency, same pattern as api/checklist.js's
// leadProgress/getLeadStageInfo) for the BD Admin-only comment preview column
// on the leads table (§2.1) — pools comments across every follow-up tied to
// the lead and returns the earliest and latest one.
export function getLeadCommentPreview(leadId) {
  const followupIds = new Set(peek('followups').filter((f) => f.lead_id === leadId).map((f) => f.id))
  if (followupIds.size === 0) return null
  const updates = peek('followupUpdates')
    .filter((u) => followupIds.has(u.followup_id))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (updates.length === 0) return null
  return { first: updates[0], last: updates[updates.length - 1] }
}
