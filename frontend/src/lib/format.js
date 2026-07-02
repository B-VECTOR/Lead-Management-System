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
