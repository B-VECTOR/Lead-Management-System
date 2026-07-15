// Lead / task hold-unhold + the Held Leads / Held Tasks lists, wired to the
// real Django REST backend (Phase 5 — Tech Req §4.9, §6; PRD §5.8).
//
// Holding a lead puts it (and its open tasks) On Hold and records the pause;
// unholding restores them. Held items are non-editable until resumed. The two
// list endpoints back the dedicated "Held Leads" / "Held Tasks" menus.
import client from './client'

function throwApiError(err) {
  const data = err.response?.data
  if (data && typeof data === 'object') {
    const firstVal = data[Object.keys(data)[0]]
    const message = Array.isArray(firstVal) ? firstVal[0] : firstVal
    if (message) throw new Error(String(message))
  }
  throw new Error('Something went wrong. Please try again.')
}

// An optional free-text `remark` is passed through to the activity log (#1);
// the backend reads it off the request body and records it on the entry.
async function post(url, remark) {
  try {
    const body = remark ? { remark } : {}
    const { data } = await client.post(url, body)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export const holdLead = (leadId, remark) => post(`/api/leads/${leadId}/hold/`, remark)
export const unholdLead = (leadId, remark) => post(`/api/leads/${leadId}/unhold/`, remark)
export const holdTask = (taskId, remark) => post(`/api/tasks/${taskId}/hold/`, remark)
export const unholdTask = (taskId, remark) => post(`/api/tasks/${taskId}/unhold/`, remark)

// Held Leads is paginated (default page size); walk every page.
export async function listHeldLeads() {
  const rows = []
  let url = '/api/held-leads/'
  while (url) {
    const { data } = await client.get(url)
    if (Array.isArray(data)) return data
    rows.push(...(data.results || []))
    url = data.next
  }
  return rows
}

// Held Tasks is unpaginated (pagination_class = None).
export async function listHeldTasks() {
  const { data } = await client.get('/api/held-tasks/')
  return Array.isArray(data) ? data : data.results || []
}
