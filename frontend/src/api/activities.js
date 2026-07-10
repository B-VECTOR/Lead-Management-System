// Lead activity log, wired to the real Django REST backend (Phase 8).
//
// Activity is now auto-logged server-side at each notable event (lead created,
// owner assigned, task completed/reassigned, hold/unhold, resources allocated,
// follow-up raised) — the frontend only reads it. Visibility follows lead
// visibility, enforced by the backend.
import client from './client'

export async function getActivitiesForLead(leadId) {
  const { data } = await client.get(`/api/leads/${leadId}/activities/`)
  return Array.isArray(data) ? data : data.results || []
}
