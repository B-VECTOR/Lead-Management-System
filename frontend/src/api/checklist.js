import { getAll, getById, update, peek } from '../mocks/db'
import { logActivity } from './activities'
import { CHECKLIST_ITEM_STATUSES } from '../mocks/seed'

function statusLabel(value) {
  return CHECKLIST_ITEM_STATUSES.find((s) => s.value === value)?.label || value
}

// A step can branch to a different next step based on the current value of
// one of its own fields (branch_field_id/branch_map, § BD flow rework) —
// e.g. "Is Solution Blueprint Required?" No skips straight to Project
// Proposal Submission. Walks from the first step following whichever branch
// is currently answered (or the natural next-by-order step, for steps that
// don't branch or haven't been answered yet) until it hits a step whose
// branch points back to itself ("stay here for another round") or a step
// with no next. Anything never reached this way is "skipped" — routed
// around by an earlier answer, so it shouldn't block progress or count
// toward it.
function computeTaskPath(tasks, fields) {
  const pathIds = new Set()
  if (tasks.length === 0) return { pathIds, skippedIds: new Set() }
  const orderedByStep = [...tasks].sort((a, b) => a.order - b.order)
  const stepIdToTaskId = Object.fromEntries(orderedByStep.map((t) => [t.source_task_step_id, t.id]))
  const taskById = Object.fromEntries(orderedByStep.map((t) => [t.id, t]))

  let current = orderedByStep[0]
  while (current && !pathIds.has(current.id)) {
    pathIds.add(current.id)
    let nextTaskId = null
    if (current.branch_field_id) {
      const branchField = fields.find((f) => f.lead_task_id === current.id && f.source_field_id === current.branch_field_id)
      const value = branchField?.field_value
      if (value && current.branch_map?.[value]) nextTaskId = stepIdToTaskId[current.branch_map[value]] ?? null
    }
    if (nextTaskId === null) {
      const naturalNext = orderedByStep.find((t) => t.order === current.order + 1)
      nextTaskId = naturalNext ? naturalNext.id : null
    }
    if (nextTaskId === current.id) break // self-loop: stays the active step
    current = nextTaskId ? taskById[nextTaskId] : null
  }
  const skippedIds = new Set(orderedByStep.filter((t) => !pathIds.has(t.id)).map((t) => t.id))
  return { pathIds, skippedIds }
}

export async function getLeadTasks(leadId) {
  const rows = await getAll('leadTasks')
  const tasks = rows.filter((t) => t.lead_id === leadId).sort((a, b) => a.order - b.order)
  const { skippedIds } = computeTaskPath(tasks, peek('leadTaskFields'))
  return tasks.map((t) => ({ ...t, skipped: skippedIds.has(t.id) }))
}

export async function getLeadChecklist(leadId) {
  const [tasks, items] = await Promise.all([getLeadTasks(leadId), getAll('leadChecklistItems')])
  const taskIds = new Set(tasks.map((t) => t.id))
  return items.filter((i) => taskIds.has(i.lead_task_id))
}

// A field can be conditionally hidden by another field's current value
// (visible_if_field_id/visible_if_value, § BD flow rework) — e.g. the fee/
// manpower/tranches fields only show once "Is Solution Blueprint Required?"
// is answered Yes. A hidden field isn't required to complete the step.
function isFieldHidden(field, siblingFields) {
  if (!field.visible_if_field_id) return false
  const controller = siblingFields.find((f) => f.source_field_id === field.visible_if_field_id)
  return !controller || controller.field_value !== field.visible_if_value
}

// A step's "Additional details" fields (§7.1) now count toward its
// completion alongside its checklist items — a step isn't Completed until
// every item is done/N/A *and* every currently-visible, non-repeatable field
// has a non-empty value. Repeatable groups (stakeholders, invoices) are
// supplementary and never block completion. Empty collections trivially
// satisfy their own half of the check, so this works uniformly for
// items-only, fields-only, and mixed steps.
function recomputeTaskStatus(items, fields) {
  const itemsDone = items.length === 0 || items.every((i) => i.state === 'done' || i.state === 'na')
  const anyItemStarted = items.some((i) => i.state !== 'open')
  const requiredFields = fields.filter((f) => f.field_type !== 'repeatable_group' && !isFieldHidden(f, fields))
  const fieldsFilled = requiredFields.length === 0 || requiredFields.every((f) => f.field_value !== '' && f.field_value != null)
  const anyFieldFilled = fields.some((f) => f.field_type !== 'repeatable_group' && f.field_value !== '' && f.field_value != null)
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
// views where an extra round trip per row would be wasteful. Steps a branch
// routed around (§ BD flow rework) don't count toward the denominator —
// they were never actually required for this lead.
export function leadProgress(leadId) {
  const tasks = peek('leadTasks').filter((t) => t.lead_id === leadId)
  const { skippedIds } = computeTaskPath(tasks, peek('leadTaskFields'))
  const taskIds = new Set(tasks.filter((t) => !skippedIds.has(t.id)).map((t) => t.id))
  const items = peek('leadChecklistItems').filter((i) => taskIds.has(i.lead_task_id))
  if (!items.length) return 0
  const done = items.filter((i) => i.state === 'done' || i.state === 'na').length
  return Math.round((done / items.length) * 100)
}

const STUCK_THRESHOLD_MS = 14 * 86400000

// Synchronous helper for the Leads list's "Stage" column: which step a lead
// is currently on, and whether it's gone stale ("stuck" — still In Progress
// with no activity in 14+ days). Skips steps a branch routed around.
export function getLeadStageInfo(leadId) {
  const tasks = peek('leadTasks').filter((t) => t.lead_id === leadId).sort((a, b) => a.order - b.order)
  if (!tasks.length) return { stepName: '—', isStuck: false }
  const { skippedIds } = computeTaskPath(tasks, peek('leadTaskFields'))
  const onPath = tasks.filter((t) => !skippedIds.has(t.id))
  const current = onPath.find((t) => t.status !== 'Completed') || onPath[onPath.length - 1] || tasks[tasks.length - 1]
  const lead = peek('leads').find((l) => l.id === leadId)
  const isStuck = !!(
    lead?.status === 'In Progress' &&
    lead.last_activity_at &&
    Date.now() - new Date(lead.last_activity_at).getTime() > STUCK_THRESHOLD_MS
  )
  return { stepName: current.name, isStuck }
}
