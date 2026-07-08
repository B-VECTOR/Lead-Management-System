import { cn } from '@/lib/utils'

// Lead status = the single execution status now that 1 lead = 1 project (§21 rework).
const LEAD_STATUS_STYLES = {
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Dropped: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

// Individual task-step status within the Task tab's checklist workspace —
// a smaller-scoped concept than the lead's own status above.
const TASK_STATUS_STYLES = {
  'Not started': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'In progress': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

// A single checklist item's 4-value status (§8.3) — read-only display on the
// row itself; the only way to change it is the item's Edit dialog.
const CHECKLIST_STATUS_STYLES = {
  open: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  na: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}
const CHECKLIST_STATUS_LABELS = { open: 'Not Started', in_progress: 'In Progress', done: 'Completed', na: 'N/A' }

const PRIORITY_STYLES = {
  Low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  Medium: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  High: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const LEAD_TYPE_STYLES = {
  BD: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  Mining: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  Extension: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
}

// One style per selectable role (§2 rework) — Employee is implicit and
// deliberately excluded here since it's never shown as its own badge.
const ROLE_STYLES = {
  'User Management': 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'Lead Admin': 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'Lead Manager': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  'Resource Manager': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  Finance: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Employee: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

// Solid fill for the 4 "real" belts; a lighter/dashed-outline treatment for
// the Potential-* variants (not yet earned) and NA.
const BELT_SOLID_STYLES = {
  Black: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
  Brown: 'bg-amber-800 text-white dark:bg-amber-700 dark:text-white',
  Red: 'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  White: 'border border-border bg-white text-neutral-700 dark:bg-neutral-100 dark:text-neutral-900',
}
const BELT_POTENTIAL_STYLES = 'border border-dashed border-border bg-transparent text-muted-foreground'
const BELT_NA_STYLES = 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'

function Pill({ className, children }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export function LeadStatusBadge({ status }) {
  return <Pill className={LEAD_STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{status}</Pill>
}

export function TaskStatusBadge({ status }) {
  return <Pill className={TASK_STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{status}</Pill>
}

export function ChecklistStatusBadge({ status }) {
  return <Pill className={CHECKLIST_STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{CHECKLIST_STATUS_LABELS[status] || status}</Pill>
}

export function PriorityBadge({ priority }) {
  return <Pill className={PRIORITY_STYLES[priority] || 'bg-neutral-100 text-neutral-700'}>{priority}</Pill>
}

export function LeadTypeBadge({ type }) {
  return <Pill className={LEAD_TYPE_STYLES[type] || 'bg-neutral-100 text-neutral-700'}>{type}</Pill>
}

export function RoleBadge({ role }) {
  return <Pill className={ROLE_STYLES[role] || 'bg-neutral-100 text-neutral-700'}>{role}</Pill>
}

export function BeltBadge({ belt }) {
  if (!belt || belt === 'NA') return <Pill className={BELT_NA_STYLES}>N/A</Pill>
  if (belt.startsWith('Potential ')) return <Pill className={BELT_POTENTIAL_STYLES}>{belt}</Pill>
  return <Pill className={BELT_SOLID_STYLES[belt] || 'bg-neutral-100 text-neutral-700'}>{belt}</Pill>
}
