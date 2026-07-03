import { getAll, insert, genId } from '../mocks/db'

export async function getActivitiesForLead(leadId) {
  const rows = await getAll('activities')
  return rows.filter((a) => a.lead_id === leadId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function logActivity({ lead_id, type, summary, body = '', created_by }) {
  return insert('activities', { id: genId('a'), lead_id, type, summary, body, created_by, created_at: new Date().toISOString() })
}
