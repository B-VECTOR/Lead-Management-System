import { getAll, getById, update, peek } from '../mocks/db'
import { logActivity } from './activities'
import { CHECKLIST_ITEM_STATUSES } from '../mocks/seed'

function statusLabel(value) {
  return CHECKLIST_ITEM_STATUSES.find((s) => s.value === value)?.label || value
}

export async function getLeadTasks(leadId) {
  const rows = await getAll('leadTasks')
  return rows.filter((t) => t.lead_id === leadId).sort((a, b) => a.order - b.order)
}

export async function getLeadChecklist(leadId) {
  const [tasks, items] = await Promise.all([getLeadTasks(leadId), getAll('leadChecklistItems')])
  const taskIds = new Set(tasks.map((t) => t.id))
  return items.filter((i) => taskIds.has(i.lead_task_id))
}

// A step's "Additional details" fields (§7.1) now count toward its
// completion alongside its checklist items — a step isn't Completed until
// every item is done/N/A *and* every field has a non-empty value. Empty
// collections trivially satisfy their own half of the check, so this works
// uniformly for items-only, fields-only, and mixed steps.
function recomputeTaskStatus(items, fields) {
  const itemsDone = items.length === 0 || items.every((i) => i.state === 'done' || i.state === 'na')
  const anyItemStarted = items.some((i) => i.state !== 'open')
  const fieldsFilled = fields.length === 0 || fields.every((f) => f.field_value !== '' && f.field_value != null)
  const anyFieldFilled = fields.some((f) => f.field_value !== '' && f.field_value != null)
  if (itemsDone && fieldsFilled) return 'Completed'
  return (anyItemStarted || anyFieldFilled) ? 'In progress' : 'Not started'
}

async function recomputeAndSaveTaskStatus(taskId) {
  const task = await getById('leadTasks', taskId)
  const [allItems, allFields] = await Promise.all([getAll('leadChecklistItems'), getAll('leadTaskFields')])
  const taskItems = allItems.filter((i) => i.lead_task_id === taskId)
  const taskFields = allFields.filter((f) => f.lead_task_id === taskId)
  const newStatus = recomputeTaskStatus(taskItems, taskFields)
  if (newStatus !== task.status) {
    await update('leadTasks', taskId, { status: newStatus })
  }
  return task
}

export async function updateChecklistItem(id, patch, currentUser) {
  const item = await getById('leadChecklistItems', id)
  const nextPatch = { ...patch }
  if (patch.state === 'done' || patch.state === 'na') {
    nextPatch.done_by = currentUser.id
    nextPatch.done_at = new Date().toISOString()
  } else if (patch.state) {
    nextPatch.done_by = null
    nextPatch.done_at = null
  }
  const updated = await update('leadChecklistItems', id, nextPatch)

  const task = await recomputeAndSaveTaskStatus(item.lead_task_id)

  await logActivity({
    lead_id: task.lead_id, type: 'ChecklistUpdate',
    summary: `"${item.label}" set to ${statusLabel(patch.state)}`, created_by: currentUser.id,
  })
  return updated
}

// Fixed additional input fields for a step (§7.1 Task tab) — not a checklist,
// just a constant set of labelled inputs a rep fills in while working the step.
export async function getLeadTaskFields(taskId) {
  const rows = await getAll('leadTaskFields')
  return rows.filter((f) => f.lead_task_id === taskId).sort((a, b) => a.order - b.order)
}

export async function updateLeadTaskFieldValue(fieldId, value) {
  const field = await getById('leadTaskFields', fieldId)
  const updated = await update('leadTaskFields', fieldId, { field_value: value })
  await recomputeAndSaveTaskStatus(field.lead_task_id)
  return updated
}

// Synchronous helper (no simulated latency) for progress-ring display in list
// views where an extra round trip per row would be wasteful.
export function leadProgress(leadId) {
  const tasks = peek('leadTasks').filter((t) => t.lead_id === leadId)
  const taskIds = new Set(tasks.map((t) => t.id))
  const items = peek('leadChecklistItems').filter((i) => taskIds.has(i.lead_task_id))
  if (!items.length) return 0
  const done = items.filter((i) => i.state === 'done' || i.state === 'na').length
  return Math.round((done / items.length) * 100)
}

const STUCK_THRESHOLD_MS = 14 * 86400000

// Synchronous helper for the Leads list's "Stage" column: which step a lead
// is currently on, and whether it's gone stale ("stuck" — still In Progress
// with no activity in 14+ days).
export function getLeadStageInfo(leadId) {
  const tasks = peek('leadTasks').filter((t) => t.lead_id === leadId).sort((a, b) => a.order - b.order)
  if (!tasks.length) return { stepName: '—', isStuck: false }
  const current = tasks.find((t) => t.status !== 'Completed') || tasks[tasks.length - 1]
  const lead = peek('leads').find((l) => l.id === leadId)
  const isStuck = !!(
    lead?.status === 'In Progress' &&
    lead.last_activity_at &&
    Date.now() - new Date(lead.last_activity_at).getTime() > STUCK_THRESHOLD_MS
  )
  return { stepName: current.name, isStuck }
}
