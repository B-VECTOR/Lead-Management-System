// Role helpers + UI-gating permissions.
//
// All visibility and write access is enforced server-side (the leads/tasks/
// follow-up/resource querysets and DRF permission classes). These helpers only
// gate what buttons/links to *show* — the backend is the source of truth, and
// mirrors of its rules here just keep the UI honest. As of Phase 8 there are no
// mock reads left; every screen runs against the live API.

// Roles are many-to-many — every user's `roles` array always includes the
// implicit 'Employee' role too.
export function hasRole(user, role) {
  return !!user?.roles?.includes(role)
}

// --- Module grouping for nav gating -----------------------------------------
// The app is organized into modules: the Lead module (leads, follow-ups, held
// leads/tasks, the leads dashboard) and the back-office modules (Resource,
// Finance, User Management) which each own a single screen.
const LEAD_MODULE_ROLES = ['Lead Admin', 'Lead Manager', 'Marketing']
const BACK_OFFICE_ROLES = ['Resource Manager', 'Finance', 'User Management']

// A user sees the Lead module if they hold a lead-facing role OR they hold no
// back-office role at all (a plain Employee is a task assignee who needs the
// Lead tab + their follow-ups). A pure Resource Manager / Finance / User
// Management user does not; multi-role users get the union.
export const canSeeLeadModule = (user) =>
  LEAD_MODULE_ROLES.some((r) => hasRole(user, r)) ||
  !BACK_OFFICE_ROLES.some((r) => hasRole(user, r))

// Follow-up is also opened up to Resource Manager specifically (Phase 9, per
// the user) — unlike Leads/Held Leads/Held Tasks, which stay back-office-hidden.
export const canSeeFollowUps = (user) =>
  canSeeLeadModule(user) || hasRole(user, 'Resource Manager')

// Held Leads is for the lead-facing management roles only (they own the lead's
// overall hold state).
export const canSeeHeldLeads = (user) =>
  LEAD_MODULE_ROLES.some((r) => hasRole(user, r))

// Held Tasks is open to every user except User Management (Phase 13, per the
// user, later narrowed): an assignee/Employee needs to see the tasks of theirs
// that are on hold, a Lead Manager reviews the hold reason + trail, and the
// API self-scopes each caller to only the held tasks they can see. User
// Management is a pure back-office role with no tasks of its own, so it has
// no use for this tab.
export const canSeeHeldTasks = (user) => !!user && !hasRole(user, 'User Management')

// Back-compat alias (older callers) — the stricter lead-facing gate.
export const canSeeHeldQueues = canSeeHeldLeads

// --- Backend-lead-shaped helpers (mirror leads/permissions.py) --------------
// A Lead Manager owns a lead they created or that is assigned to them; Marketing
// owns leads they created; a Lead Admin may act only on a still-unassigned lead
// (to assign an owner — which starts the workflow).
const isManagerOwn = (user, lead) =>
  hasRole(user, 'Lead Manager') && (lead?.created_by === user.id || lead?.assigned_to === user.id)
const isMarketingOwn = (user, lead) => hasRole(user, 'Marketing') && lead?.created_by === user.id
const isAdminUnassigned = (user, lead) => hasRole(user, 'Lead Admin') && lead?.assigned_to == null

export const PERMISSIONS = {
  // Lead CRUD (backend-enforced by LeadPermission).
  createLead: (user) => hasRole(user, 'Lead Manager') || hasRole(user, 'Marketing'),
  editLead: (user, lead) => isManagerOwn(user, lead) || isMarketingOwn(user, lead) || isAdminUnassigned(user, lead),
  reassignLeadOwner: (user, lead) => isManagerOwn(user, lead) || isAdminUnassigned(user, lead),
  // Hold/unhold a lead — mirrors leads/permissions.can_hold_lead (Phase 11):
  // Lead Admin, or a Lead Manager who created/was-assigned the lead. The plain
  // assignee no longer holds a lead (only their own task); a self-assigned LM
  // still qualifies via the created/assigned branch.
  holdLead: (user, lead) =>
    hasRole(user, 'Lead Admin') ||
    (hasRole(user, 'Lead Manager') && (lead?.created_by === user?.id || lead?.assigned_to === user?.id)),
  // Drop (cancel) a lead — mirrors the backend's can_drop_lead: the hold-lead
  // actors plus a Marketing creator (who may edit every field of their leads).
  dropLead: (user, lead) =>
    PERMISSIONS.holdLead(user, lead) ||
    (hasRole(user, 'Marketing') && lead?.created_by === user?.id),
  // Delete a lead attachment — mirrors the backend's can_hold_lead delete gate.
  deleteAttachment: (user, lead) =>
    hasRole(user, 'Lead Admin') ||
    (hasRole(user, 'Lead Manager') && (lead?.created_by === user?.id || lead?.assigned_to === user?.id)),
  manageUsers: (user) => hasRole(user, 'User Management'),
  // Lead Admin: global visibility, read-only across the lead screens.
  viewFollowupPreview: (user) => hasRole(user, 'Lead Admin'),
  // Anyone who can see a lead may raise a follow-up on it (Phase 12 — the
  // assigned Red / Resource Manager included). Mirrors the backend, which lets
  // any authenticated user create and validates the target lead is visible.
  manageFollowups: (user) => canSeeFollowUps(user),
}
