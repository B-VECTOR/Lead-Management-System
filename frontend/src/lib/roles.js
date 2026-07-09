// Maps backend Group names (snake_case, from GET /api/groups/) to the display
// labels used throughout the app's still-mocked permission logic (src/api/scope.js)
// and mock seed data, which predate the backend and use Title Case ('Lead
// Manager', 'User Management', ...). The *set* of assignable roles now comes
// from the database (src/hooks/useLookups.js); this table only translates a
// known group's slug into its existing display label — it isn't a hardcoded
// list of options.
export const GROUP_LABELS = {
  user_management: 'User Management',
  lead_admin: 'Lead Admin',
  lead_manager: 'Lead Manager',
  marketing: 'Marketing',
  resource_manager: 'Resource Manager',
  finance: 'Finance',
  employee: 'Employee',
}

// Every user implicitly holds this role in addition to whatever's in their
// own `roles` array; it's granted automatically and never shown as a
// selectable checkbox in the Users UI.
export const IMPLICIT_GROUP_NAME = 'employee'
export const IMPLICIT_ROLE = GROUP_LABELS[IMPLICIT_GROUP_NAME]

export function groupLabel(name) {
  return GROUP_LABELS[name] || name
}
