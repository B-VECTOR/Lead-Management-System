// Leads, wired to the real Django REST backend (Phase 3).
//
// The backend now owns leads (`/api/leads/`), enforces the PRD §6 / Tech Req
// §12 permission matrix server-side, and scopes the list per role — so this
// module no longer filters against the localStorage mock (the old
// `visibleLeadIds` mock reads are gone). The deeper workflow screens (tasks,
// resources, follow-ups, activity, files) are still mock-backed until their
// phases; they simply read empty for backend-created leads.
//
// Per the Phase-3 decision there is no Company entity: the company is a plain
// `company_name` text field on the lead.
import client from './client'
import { getAssignableUsers } from './lookups'

// DRF returns validation errors as { field: [messages] }; surface the first
// one instead of axios's generic "Request failed with status code 400".
function throwApiError(err) {
  const data = err.response?.data
  if (data && typeof data === 'object') {
    const firstVal = data[Object.keys(data)[0]]
    const message = Array.isArray(firstVal) ? firstVal[0] : firstVal
    if (message) throw new Error(String(message))
  }
  throw new Error('Something went wrong. Please try again.')
}

// Backend lead → the shape the frontend screens consume. `name` is kept as an
// alias of `project_name` so existing list/detail code reads naturally.
function fromApiLead(l) {
  return {
    id: l.id,
    name: l.project_name,
    project_name: l.project_name,
    company_name: l.company_name,
    country: l.country,
    country_name: l.country_name,
    industry: l.industry,
    industry_name: l.industry_name,
    domain: l.domain,
    domain_name: l.domain_name,
    division: l.division || '',
    scope: l.scope || '',
    assigned_to: l.assigned_to ?? null,
    assigned_to_name: l.assigned_to_name || null,
    lead_type: l.lead_type,
    status: l.status,
    project_id: l.project_id || '',
    project_id_base: l.project_id_base || '',
    extension: l.extension || '00',
    created_by: l.created_by,
    created_by_name: l.created_by_name || null,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }
}

// Form shape → backend payload. Only maps lead fields the backend accepts;
// `assigned_to`/`status` are included only when the form supplied them (so a
// Marketing form never sends an owner, and edits send just what changed).
function toApiPayload(data) {
  const payload = {}
  const passthrough = [
    'country', 'company_name', 'project_name', 'industry', 'domain',
    'division', 'scope', 'lead_type',
  ]
  for (const key of passthrough) {
    if (key in data) payload[key] = data[key]
  }
  if ('assigned_to' in data) payload.assigned_to = data.assigned_to || null
  if ('status' in data) payload.status = data.status
  return payload
}

// Fetches every page of the (paginated) list endpoint.
async function fetchAllLeads() {
  const rows = []
  let url = '/api/leads/'
  while (url) {
    const { data } = await client.get(url)
    if (Array.isArray(data)) return data
    rows.push(...(data.results || []))
    url = data.next
  }
  return rows
}

// filters: { status, lead_type, q }. Visibility is enforced by the backend;
// these are client-side conveniences over the already-scoped result set.
export async function listLeads(_currentUser, filters = {}) {
  let rows = (await fetchAllLeads()).map(fromApiLead)
  if (filters.status) rows = rows.filter((l) => l.status === filters.status)
  if (filters.lead_type) rows = rows.filter((l) => l.lead_type === filters.lead_type)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter(
      (l) =>
        (l.project_name || '').toLowerCase().includes(q) ||
        (l.company_name || '').toLowerCase().includes(q) ||
        (l.industry_name || '').toLowerCase().includes(q),
    )
  }
  return rows
}

export async function getLead(id) {
  const { data } = await client.get(`/api/leads/${id}/`)
  return fromApiLead(data)
}

export async function createLead(data) {
  try {
    const { data: created } = await client.post('/api/leads/', toApiPayload(data))
    return fromApiLead(created)
  } catch (err) {
    throwApiError(err)
  }
}

export async function updateLead(id, patch) {
  try {
    const { data } = await client.patch(`/api/leads/${id}/`, toApiPayload(patch))
    return fromApiLead(data)
  } catch (err) {
    throwApiError(err)
  }
}

export async function updateLeadStatus(id, status) {
  try {
    const { data } = await client.patch(`/api/leads/${id}/`, { status })
    return fromApiLead(data)
  } catch (err) {
    throwApiError(err)
  }
}

// Assign/reassign the owner (assigned_to). Lead Admin uses this to assign an
// unassigned Marketing lead; a Lead Manager to reassign one of their own.
export async function assignLeadOwner(id, ownerId) {
  try {
    const { data } = await client.patch(`/api/leads/${id}/`, { assigned_to: ownerId || null })
    return fromApiLead(data)
  } catch (err) {
    throwApiError(err)
  }
}

export { getAssignableUsers }
