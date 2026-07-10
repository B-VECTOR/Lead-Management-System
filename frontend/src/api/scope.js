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
  // Hold/unhold a lead — mirrors leads/permissions.can_hold_lead: Lead Admin,
  // the lead owner, or the Lead-Manager creator/owner.
  holdLead: (user, lead) =>
    hasRole(user, 'Lead Admin') ||
    lead?.assigned_to === user?.id ||
    (hasRole(user, 'Lead Manager') && (lead?.created_by === user?.id || lead?.assigned_to === user?.id)),
  // Delete a lead attachment — mirrors the backend's can_hold_lead delete gate.
  deleteAttachment: (user, lead) =>
    hasRole(user, 'Lead Admin') ||
    lead?.assigned_to === user?.id ||
    (hasRole(user, 'Lead Manager') && (lead?.created_by === user?.id || lead?.assigned_to === user?.id)),
  manageUsers: (user) => hasRole(user, 'User Management'),
  // Lead Admin: global visibility, read-only across the lead screens.
  viewFollowupPreview: (user) => hasRole(user, 'Lead Admin'),
  // Only a Lead Manager may raise a follow-up (§12 "Add follow-up task");
  // mirrors the backend FollowupPermission POST rule.
  manageFollowups: (user) => hasRole(user, 'Lead Manager'),
}
