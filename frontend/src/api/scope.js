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
  // Representative: only leads assigned to them
  const ids = peek('leads').filter((l) => l.assigned_to === user.id).map((l) => l.id)
  return new Set(ids)
}

export function canViewLead(user, lead) {
  const ids = visibleLeadIds(user)
  if (ids === null) return true
  return ids.has(lead.id)
}

export const PERMISSIONS = {
  createLead: (user) => user.role === 'Admin' || user.role === 'Manager',
  editLead: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  reassignLeadOwner: (user) => user.role === 'Admin',
  archiveLead: (user) => user.role === 'Admin',
  deleteAttachment: (user) => user.role === 'Admin',
  assignTasks: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  configureChecklistOnLead: (user, lead) => user.role === 'Admin' || (user.role === 'Manager' && lead.owner_id === user.id),
  updateChecklistItem: (user, lead) => user.role === 'Admin' || user.role === 'Manager' || (user.role === 'Representative' && lead.assigned_to === user.id),
  configureTemplatesGlobal: (user) => user.role === 'Admin',
  manageUsers: (user) => user.role === 'Admin',
}
