// Follow-ups & "Other Tasks", wired to the real Django REST backend
// (Phase 7 — Tech Req §4.10, §8; PRD §5.11).
//
// A Lead Manager raises a follow-up against a lead and assigns it to a user
// (an Employee-role user, or themself). It surfaces on the shared "Other Tasks"
// screen for whoever it is assigned to, and in the lead's own Follow Up tab.
// Progress is tracked as a chat-style comment thread plus an open → done
// status (both kept from the prior UI per the confirmed Phase-7 decision).
import client from './client'

function firstMessage(data) {
  if (data == null) return null
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return firstMessage(data[0])
  if (typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const msg = firstMessage(data[key])
      if (msg) return msg
    }
  }
  return null
}

function throwApiError(err) {
  const msg = firstMessage(err.response?.data)
  throw new Error(msg || 'Something went wrong. Please try again.')
}

function rows(data) {
  return Array.isArray(data) ? data : data.results || []
}

// The follow-up list is paginated (DRF default) — walk every page.
export async function listFollowups(filters = {}) {
  const params = new URLSearchParams()
  if (filters.leadId) params.set('lead', filters.leadId)
  if (filters.assignedToMe) params.set('assigned_to_me', '1')
  const out = []
  let url = `/api/followups/${params.toString() ? `?${params}` : ''}`
  while (url) {
    const { data } = await client.get(url)
    if (Array.isArray(data)) return data
    out.push(...(data.results || []))
    url = data.next
  }
  return out
}

export async function createFollowup(data) {
  try {
    const { data: created } = await client.post('/api/followups/', {
      lead: data.lead,
      title: data.title,
      assigned_to: data.assigned_to,
      followup_date: data.followup_date,
      remark: data.remark || '',
    })
    return created
  } catch (err) {
    throwApiError(err)
  }
}

export async function updateFollowup(id, patch) {
  try {
    const { data } = await client.patch(`/api/followups/${id}/`, patch)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// Comment thread — oldest first (chat-style), served by the follow-up's
// nested updates endpoint (unpaginated).
export async function listFollowupUpdates(followupId) {
  const { data } = await client.get(`/api/followups/${followupId}/updates/`)
  return rows(data)
}

export async function addFollowupUpdate(followupId, comment) {
  try {
    const { data } = await client.post(`/api/followups/${followupId}/updates/`, { comment })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// Terminal action — optionally logs a closing comment, then marks the
// follow-up done.
export async function closeFollowup(followupId, comment) {
  if (comment && comment.trim()) {
    await addFollowupUpdate(followupId, comment.trim())
  }
  return updateFollowup(followupId, { status: 'done' })
}

// Assignee dropdown for the create form (Lead-Manager-only endpoint).
export async function listFollowupAssignees() {
  const { data } = await client.get('/api/followup-assignees/')
  return rows(data)
}
