export function formatCurrency(value, currency = 'USD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}

export function formatCompactCurrency(value, currency = 'USD') {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function formatRelativeDue(value) {
  if (!value) return null
  const diffMs = new Date(value).getTime() - Date.now()
  const diffDays = Math.round(diffMs / 86400000)
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays === -1) return 'Overdue by 1 day'
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} days`
  return `Due in ${diffDays} days`
}

export function isOverdue(value) {
  return !!value && new Date(value).getTime() < Date.now()
}

export function initials(name) {
  if (!name) return '?'
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

// Is this row's person the signed-in user? Matches on id where the row carries
// one (names aren't unique), falling back to the display name.
export function isCurrentUser(currentUser, id, name) {
  if (!currentUser) return false
  if (id != null) return id === currentUser.id
  return !!name && name === currentUser.name
}

// A person's name for display, where the signed-in user reads as "me" instead
// of their own name (per the user: "Assigned to me", not "Assigned to <my
// name>"). `capitalize` for a standalone value — a table cell or a stat card;
// leave it off mid-sentence. Returns the name unchanged for everyone else, and
// passes through null/'' so callers keep their own "Not assigned" fallback.
export function personName(name, currentUser, { id = null, capitalize = false } = {}) {
  if (!name) return name
  if (isCurrentUser(currentUser, id, name)) return capitalize ? 'Me' : 'me'
  return name
}

// Roles are many-to-many with an always-present implicit 'Employee' — hide
// that one in free-text display since it's not a meaningful distinguisher.
export function displayRoles(user) {
  const roles = (user?.roles || []).filter((r) => r !== 'Employee')
  return roles.length ? roles.join(', ') : 'Employee'
}
