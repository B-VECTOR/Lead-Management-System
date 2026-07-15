import { cn } from '@/lib/utils'

// Lead status = the single execution status now that 1 lead = 1 project (§21 rework).
const LEAD_STATUS_STYLES = {
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Dropped: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  Hybernation: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  // v12 uses "Complete"; keep "Completed" for any legacy mock data.
  Complete: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
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

// Backend task-instance status (Phase 4 engine): pending / open / hold / closed.
const TASK_STATE_STYLES = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}
const TASK_STATE_LABELS = { pending: 'Pending', open: 'Open', hold: 'On Hold', closed: 'Completed' }

// Backend checklist-item status (Tech Req §4.5): not_started / inprogress / complete.
const CHECKLIST_ITEM_STYLES = {
  not_started: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  inprogress: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  complete: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}
const CHECKLIST_ITEM_LABELS = { not_started: 'Not started', inprogress: 'In progress', complete: 'Complete' }

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

// Solid fill for the 4 "real" belts. Each Potential-* variant (not yet earned)
// gets a dashed outline in its base belt's colour instead of one flat grey —
// so a Potential Red still reads red, a Potential Brown brown, etc. White is
// the exception: it has no visible colour of its own, so its Potential variant
// uses a grey dashed outline with a faint white tint (per the user).
const BELT_SOLID_STYLES = {
  Black: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
  Brown: 'bg-amber-800 text-white dark:bg-amber-700 dark:text-white',
  Red: 'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  White: 'border border-border bg-white text-neutral-700 dark:bg-neutral-100 dark:text-neutral-900',
}
const BELT_POTENTIAL_STYLES = {
  Black: 'border border-dashed border-neutral-800 bg-transparent text-neutral-800 dark:border-neutral-300 dark:text-neutral-300',
  Brown: 'border border-dashed border-amber-800 bg-transparent text-amber-800 dark:border-amber-600 dark:text-amber-500',
  Red: 'border border-dashed border-red-600 bg-transparent text-red-600 dark:border-red-500 dark:text-red-400',
  White: 'border border-dashed border-neutral-400 bg-white/40 text-neutral-600 dark:border-neutral-500 dark:bg-neutral-100/10 dark:text-neutral-300',
}
const BELT_POTENTIAL_FALLBACK = 'border border-dashed border-border bg-transparent text-muted-foreground'
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

export function TaskStateBadge({ status }) {
  return <Pill className={TASK_STATE_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{TASK_STATE_LABELS[status] || status}</Pill>
}

export function ChecklistItemBadge({ status }) {
  return <Pill className={CHECKLIST_ITEM_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{CHECKLIST_ITEM_LABELS[status] || status}</Pill>
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
  if (belt.startsWith('Potential ')) {
    const base = belt.slice('Potential '.length)
    return <Pill className={BELT_POTENTIAL_STYLES[base] || BELT_POTENTIAL_FALLBACK}>{belt}</Pill>
  }
  return <Pill className={BELT_SOLID_STYLES[belt] || 'bg-neutral-100 text-neutral-700'}>{belt}</Pill>
}
