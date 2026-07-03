import { listLeads } from './leads'
import { listFollowups } from './followups'
import { leadProgress } from './checklist'
import { LEAD_STATUSES } from '../mocks/seed'

export async function getDashboardSummary(currentUser) {
  const [leads, followups] = await Promise.all([listLeads(currentUser), listFollowups(currentUser)])

  const countByStatus = LEAD_STATUSES.map((status) => ({
    status,
    count: leads.filter((l) => l.status === status).length,
  }))

  const overdueFollowups = followups.filter((f) => !f.done && new Date(f.due_date) < new Date())

  const activeLeads = leads
    .filter((l) => l.status === 'In Progress' || l.status === 'On Hold')
    .map((l) => ({ ...l, progress: leadProgress(l.id) }))

  return {
    totalLeads: leads.length,
    activeLeadCount: activeLeads.length,
    countByStatus,
    overdueFollowups,
    activeLeads,
    completedCount: leads.filter((l) => l.status === 'Completed').length,
    droppedCount: leads.filter((l) => l.status === 'Dropped').length,
  }
}
