import { getAll } from '../mocks/db'
import { listLeads } from './leads'
import { listFollowups } from './followups'
import { listProjects, projectProgress } from './projects'
import { LEAD_STATUSES } from '../mocks/seed'

export async function getDashboardSummary(currentUser) {
  const [leads, followups, projects, leadTypes] = await Promise.all([
    listLeads(currentUser), listFollowups(currentUser), listProjects(currentUser), getAll('leadTypes'),
  ])

  const openLeads = leads.filter((l) => !l.status.startsWith('Closed'))
  const pipelineValue = openLeads.reduce((sum, l) => sum + (l.acv || 0), 0)

  const valueByStage = LEAD_STATUSES.map((status) => ({
    status,
    value: leads.filter((l) => l.status === status).reduce((sum, l) => sum + (l.acv || 0), 0),
    count: leads.filter((l) => l.status === status).length,
  }))

  const countByType = leadTypes.map((t) => ({
    type: t.name,
    count: leads.filter((l) => l.lead_type_id === t.id).length,
  }))

  const overdueFollowups = followups.filter((f) => !f.done && new Date(f.due_date) < new Date())

  const myProjects = currentUser.role === 'Representative' ? projects.filter((p) => p.assigned_to === currentUser.id) : projects
  const myTasks = myProjects
    .filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled')
    .map((p) => ({ ...p, progress: projectProgress(p.id) }))

  return {
    pipelineValue,
    openLeadCount: openLeads.length,
    valueByStage,
    countByType,
    overdueFollowups,
    myTasks,
    wonThisPeriod: leads.filter((l) => l.status === 'Closed Won'),
    lostThisPeriod: leads.filter((l) => l.status === 'Closed Lost'),
  }
}
