import { getAll, insert, genId } from '../mocks/db'
import { visibleLeadIds } from './scope'

// Routing a request to whoever fulfills it (a new role/person) isn't built
// yet — for now this just records what was asked for, by whom, and by when.
export async function listResourceRequests(currentUser, filters = {}) {
  const rows = await getAll('resourceRequests')
  const leadIds = visibleLeadIds(currentUser)
  let visible = rows.filter((r) => leadIds === null || leadIds.has(r.lead_id))
  if (filters.leadId) visible = visible.filter((r) => r.lead_id === filters.leadId)
  return visible.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function createResourceRequest(data, currentUser) {
  const row = {
    id: genId('rr'),
    lead_id: data.lead_id,
    type: data.type,
    due_date: data.due_date,
    status: 'Requested',
    requested_by: currentUser.id,
    created_at: new Date().toISOString(),
  }
  return insert('resourceRequests', row)
}
