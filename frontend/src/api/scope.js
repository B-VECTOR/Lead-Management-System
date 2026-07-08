// Server-side role scoping (specs.md §2.1) reimplemented client-side for the mock
// API. When the real DRF backend lands, this logic moves into permission
// classes/querysets (§15) and these helpers go away — callers only need the
// higher-level api/*.js functions to keep working the same way.
import { peek } from './../mocks/db'

// Roles are many-to-many — every user's `roles` array always includes the
// implicit 'Employee' role too (see mocks/seed.js).
export function hasRole(user, role) {
  return !!user?.roles?.includes(role)
}

// A user with none of the elevated roles is a plain executor — the closest
// equivalent to the old single-role 'Representative'.
function isExecutionOnly(user) {
  return !hasRole(user, 'Lead Manager') && !hasRole(user, 'Lead Admin')
}

export function visibleLeadIds(user) {
  if (!user) return new Set()
  if (hasRole(user, 'Lead Admin')) return null // null = no filter, sees everything (read-only)
  if (hasRole(user, 'Lead Manager')) {
    // Owner-scoped: only leads currently owned by this Lead Manager.
    const ids = peek('leads').filter((l) => l.owner_id === user.id).map((l) => l.id)
    return new Set(ids)
  }
  // Everyone else (Employee-only, Marketing, Resource Manager, Finance): only leads assigned to them.
  const ids = peek('leads').filter((l) => l.assigned_to === user.id).map((l) => l.id)
  return new Set(ids)
}

export function canViewLead(user, lead) {
  const ids = visibleLeadIds(user)
  if (ids === null) return true
  return ids.has(lead.id)
}

const isOwner = (user, lead) => hasRole(user, 'Lead Manager') && lead.owner_id === user.id
// A Lead Admin keeps checklist-update rights on leads it created even after
// ownership moves to a Lead Manager — creator, owner, and assigned rep can
// all work the checklist; other mutations (edit, reassign, archive, ...)
// stay owner-only.
const isCreator = (user, lead) => hasRole(user, 'Lead Admin') && lead.created_by === user.id

export const PERMISSIONS = {
  createLead: (user) => hasRole(user, 'Lead Manager') || hasRole(user, 'Marketing'),
  editLead: (user, lead) => isOwner(user, lead),
  reassignLeadOwner: (user, lead) => isOwner(user, lead),
  archiveLead: (user, lead) => isOwner(user, lead),
  deleteAttachment: (user, lead) => isOwner(user, lead),
  assignTasks: (user, lead) => isOwner(user, lead),
  configureChecklistOnLead: (user, lead) => isOwner(user, lead),
  updateChecklistItem: (user, lead) => isOwner(user, lead) || isCreator(user, lead) || (isExecutionOnly(user) && lead.assigned_to === user.id),
  configureTemplatesGlobal: (user) => hasRole(user, 'User Management'),
  manageUsers: (user) => hasRole(user, 'User Management'),
  // Lead Admin (renamed from BD Admin): global visibility, strictly read-only everywhere above.
  viewFollowupPreview: (user) => hasRole(user, 'Lead Admin'),
  manageFollowups: (user) => !hasRole(user, 'Lead Admin'),
}
