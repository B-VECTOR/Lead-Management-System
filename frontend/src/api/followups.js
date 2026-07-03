import { getAll, insert, update, genId } from '../mocks/db'
import { visibleLeadIds } from './scope'
import { notify } from './notifications'

export async function listFollowups(currentUser, filters = {}) {
  const rows = await getAll('followups')
  const leadIds = visibleLeadIds(currentUser)
  let visible = rows.filter((f) => {
    if (currentUser.role === 'Admin') return true
    if (f.lead_id) return leadIds === null || leadIds.has(f.lead_id)
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

export async function updateFollowup(id, patch) {
  return update('followups', id, patch)
}
