import { cn } from '@/lib/utils'

const LEAD_STATUS_STYLES = {
  New: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Qualified: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  'Demo/Evaluation': 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  Proposal: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Negotiation: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  'Closed Won': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'Closed Lost': 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  'On Hold': 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

const PROJECT_STATUS_STYLES = {
  'Not started': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'In progress': 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  Blocked: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Cancelled: 'bg-neutral-200 text-neutral-500 line-through dark:bg-neutral-800 dark:text-neutral-500',
}

const PRIORITY_STYLES = {
  Low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  Medium: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  High: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  Urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const BELT_STYLES = {
  white: 'bg-neutral-100 text-neutral-700 border border-neutral-300',
  brown: 'bg-amber-800/10 text-amber-800 border border-amber-800/30',
  red: 'bg-red-600/10 text-red-700 border border-red-600/30',
  black: 'bg-neutral-900 text-white border border-neutral-900',
}

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

export function ProjectStatusBadge({ status }) {
  return <Pill className={PROJECT_STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-700'}>{status}</Pill>
}

export function PriorityBadge({ priority }) {
  return <Pill className={PRIORITY_STYLES[priority] || 'bg-neutral-100 text-neutral-700'}>{priority}</Pill>
}

export function BeltBadge({ belt }) {
  return <Pill className={cn('capitalize', BELT_STYLES[belt] || 'bg-neutral-100 text-neutral-700')}>{belt} belt</Pill>
}
