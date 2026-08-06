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
    // R9-1: the Project ID is the identifier the business works with; `id` is
    // just the row number (1, 2, 3). The old synthetic `lead_display_id`
    // ("LD-2026-00001") is retired on both sides.
    id: l.id,
    progress: l.progress ?? 0,
    task_progress: l.task_progress || { total: 0, closed: 0, percent: 0 },
    current_task: l.current_task || null,
    has_held_task: l.has_held_task ?? false,
    drop_remark: l.drop_remark || '',
    active_hold: l.active_hold || null,
    // Short-close (§9.2/§5.12): whether the action is available right now
    // (`engine.can_short_close`) and the stamp left behind once it has fired.
    // Both were missing from this adapter until 2026-07-30, which silently
    // killed every short-close affordance — the Lead Detail CTA/banner and the
    // Leads-list icon all read them off the mapped object.
    can_short_close: l.can_short_close ?? false,
    short_close_info: l.short_close_info || null,
    name: l.project_name,
    project_name: l.project_name,
    company_name: l.company_name,
    base_code: l.base_code || '',
    parent_lead: l.parent_lead ?? null,
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
    flow_of_tasks: l.flow_of_tasks || '',
    type_of_project: l.type_of_project || '',
    status: l.status,
    // R2 (§13): the derived, stage-legible Project ID + current stage. Screens
    // display `project_id_display` (base + current-stage suffix); `project_id`
    // is the lead's stable base snapshot, used where a suffix would be noise.
    project_id_display: l.project_id_display || '',
    current_stage: l.current_stage || null,
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
    // `country` is a required lead field again (§13.4: it supplies the Project
    // ID's country segment) — it must be in this list or a create 400s with
    // "This field is required." while the form looks complete.
    'company_name', 'project_name', 'country', 'industry', 'domain',
    'division', 'scope', 'lead_type', 'flow_of_tasks', 'type_of_project',
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
//
// **Loads every lead.** Kept for the screens that genuinely need the whole set
// in memory (a lead picker), and it is exactly what the leads *table* must not
// do — see `listLeadsPage` below.
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

// The leads-list filter names, mapped to the query params `leads/filters.py`
// reads. Blank / "all" values are omitted so the URL and the request stay clean.
const LEAD_FILTER_PARAMS = {
  text: 'q',
  projectId: 'project_id',
  industry: 'industry',
  domain: 'domain',
  owner: 'owner',
  currentStage: 'stage',
  currentTask: 'task_no',
  status: 'status',
  leadType: 'lead_type',
}

export function leadFilterParams(filters = {}) {
  const params = {}
  for (const [key, param] of Object.entries(LEAD_FILTER_PARAMS)) {
    const value = filters[key]
    if (value === undefined || value === null) continue
    const str = String(value).trim()
    if (str === '' || str === 'all') continue
    params[param] = str
  }
  return params
}

// One page of the leads list (R25). Filtering, ordering and the page slice all
// happen **server-side**, so the page is a page of the filtered set — a filter
// applied here searches every lead the user may see, not the rows on screen.
export async function listLeadsPage({ page = 1, pageSize = 50, filters = {} } = {}) {
  const { data } = await client.get('/api/leads/', {
    params: { page, page_size: pageSize, ...leadFilterParams(filters) },
  })
  // An unpaginated array would mean someone dropped the pagination class; treat
  // it as a single page rather than rendering an empty table.
  if (Array.isArray(data)) {
    const rows = data.map(fromApiLead)
    return { rows, count: rows.length, page: 1, pageSize, pageCount: 1 }
  }
  const count = data.count ?? 0
  return {
    rows: (data.results || []).map(fromApiLead),
    count,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(count / pageSize)),
  }
}

// Every value the list's filter dropdowns can offer, computed over the caller's
// whole scoped set of leads — never over the current page, which is what keeps a
// filter usable once the data spans many pages.
export async function getLeadFilterOptions() {
  const { data } = await client.get('/api/leads/filter-options/')
  return data
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

// Drop (cancel) a lead via the dedicated endpoint (Phase 14d — a plain
// `status = "Dropped"` PATCH is rejected by the backend). The optional remark
// is stored on the lead and shown as a banner while it is Dropped.
export async function dropLead(id, remark) {
  try {
    const { data } = await client.post(`/api/leads/${id}/drop/`, { remark: remark || '' })
    return fromApiLead(data)
  } catch (err) {
    throwApiError(err)
  }
}

// Short-close (R6, §9.2/§5.12) — a lead-scoped action (Resource Manager only):
// opens Project Closure ahead of its natural trigger. The compulsory remark is
// stamped on the lead and shown as a banner; the response is the opened task.
export async function shortCloseLead(id, remark) {
  try {
    const { data } = await client.post(`/api/leads/${id}/short-close/`, { remark: remark || '' })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// Assign/reassign the owner (assigned_to). Lead Admin uses this to assign an
// unassigned Marketing lead; a Lead Manager to reassign one of their own. An
// optional `remark` is recorded on the reassignment activity entry (#1).
export async function assignLeadOwner(id, ownerId, remark) {
  try {
    const payload = { assigned_to: ownerId || null }
    if (remark) payload.remark = remark
    const { data } = await client.patch(`/api/leads/${id}/`, payload)
    return fromApiLead(data)
  } catch (err) {
    throwApiError(err)
  }
}

export { getAssignableUsers }
