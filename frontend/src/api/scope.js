// Server-side role scoping (specs.md §2.1) reimplemented client-side for the mock
// API. When the real DRF backend lands, this logic moves into permission
// classes/querysets (§15) and these helpers go away — callers only need the
// higher-level api/*.js functions to keep working the same way.
import { peek } from './../mocks/db'

export function visibleLeadIds(user) {
  if (!user) return new Set()
  if (user.role === 'BD Admin') return null // null = no filter, sees everything (read-only)
  if (user.role === 'Admin') {
    // Admin sees every lead it created, even after handing ownership to a
    // Manager (owner_id changes on delegation, created_by never does).
    const ids = peek('leads').filter((l) => l.created_by === user.id).map((l) => l.id)
    return new Set(ids)
  }
  if (user.role === 'Manager') {
    // Owner-scoped: a Manager only sees leads it currently owns — either
    // self-created, or handed to it by an Admin at creation/reassignment.
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

const isOwner = (user, lead) => (user.role === 'Admin' || user.role === 'Manager') && lead.owner_id === user.id
// The Admin who created the lead keeps checklist-update rights even after
// delegating ownership to a Manager — creator, owner, and assigned rep can
// all work the checklist; other mutations (edit, reassign, archive, ...)
// stay owner-only.
const isCreator = (user, lead) => user.role === 'Admin' && lead.created_by === user.id

export const PERMISSIONS = {
  createLead: (user) => user.role === 'Admin' || user.role === 'Manager',
  editLead: (user, lead) => isOwner(user, lead),
  reassignLeadOwner: (user, lead) => isOwner(user, lead),
  archiveLead: (user, lead) => isOwner(user, lead),
  deleteAttachment: (user, lead) => isOwner(user, lead),
  assignTasks: (user, lead) => isOwner(user, lead),
  configureChecklistOnLead: (user, lead) => isOwner(user, lead),
  updateChecklistItem: (user, lead) => isOwner(user, lead) || isCreator(user, lead) || (user.role === 'Representative' && lead.assigned_to === user.id),
  configureTemplatesGlobal: (user) => user.role === 'Admin',
  manageUsers: (user) => user.role === 'Admin',
  // BD Admin: global visibility, strictly read-only everywhere above.
  viewFollowupPreview: (user) => user.role === 'BD Admin',
  manageFollowups: (user) => user.role !== 'BD Admin',
}
