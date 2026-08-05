// The Lead Trail — a lead's append-only comment thread (R23-1, user 2026-08-05).
//
// Two endpoints only, because the trail is append-only: list and create. There
// is deliberately no update or delete — an edited trail is not a trail. Who may
// read and who may write are the same question server-side (visibility *is* the
// permission), so there is no `can_comment` flag to carry around: if the lead
// loaded, the trail is readable and writable.
import client from './client'

export async function listLeadComments(leadId) {
  const { data } = await client.get(`/api/leads/${leadId}/comments/`)
  return Array.isArray(data) ? data : data.results || []
}

export async function addLeadComment(leadId, comment) {
  const { data } = await client.post(`/api/leads/${leadId}/comments/`, { comment })
  return data
}
