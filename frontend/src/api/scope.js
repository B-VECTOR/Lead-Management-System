// Server-side role scoping (specs.md §2.1) reimplemented client-side for the mock
// API. When the real DRF backend lands, this logic moves into permission
// classes/querysets (§15) and these helpers go away — callers only need the
// higher-level api/*.js functions to keep working the same way.
import { peek } from './../mocks/db'

export function visibleLeadIds(user) {
  if (!user) return new Set()
  if (user.role === 'Admin') return null // null = no filter, see all
  if (user.role === 'Manager') {
    const ids = peek('leads').filter((l) => l.owner_id === user.id).map((l) => l.id)
    return new Set(ids)
  }
  // Representative: only leads with a project assigned to them
  const projectLeadIds = peek('projects').filter((p) => p.assigned_to === user.id).map((p) => p.lead_id)
  return new Set(projectLeadIds)
}

export function canViewLead(user, lead) {
  const ids = visibleLeadIds(user)
  if (ids === null) return true
  return ids.has(lead.id)
}

export function visibleProjectIds(user) {
  if (!user) return new Set()
  if (user.role === 'Admin') return null
  if (user.role === 'Representative') {
    const ids = peek('projects').filter((p) => p.assigned_to === user.id).map((p) => p.id)
    return new Set(ids)
  }
  // Manager: projects under leads they own
  const leadIds = visibleLeadIds(user)
  const ids = peek('projects').filter((p) => leadIds.has(p.lead_id)).map((p) => p.id)
  return new Set(ids)
}

export const PERMISSIONS = {
  createLead: (user) => user.role === 'Admin' || user.role === 'Manager',
  editLead: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  reassignLeadOwner: (user) => user.role === 'Admin',
  archiveLead: (user) => user.role === 'Admin',
  createProject: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  assignTasks: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  configureChecklistOnLead: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  updateChecklistItem: (user, project) => user.role === 'Admin' || user.role === 'Manager' || (user.role === 'Representative' && project.assigned_to === user.id),
  configureTemplatesGlobal: (user) => user.role === 'Admin',
  manageUsers: (user) => user.role === 'Admin',
}
