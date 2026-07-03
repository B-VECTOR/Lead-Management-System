import { getAll, getById, update, peek } from '../mocks/db'
import { logActivity } from './activities'
import { visibleLeadIds } from './scope'
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

function recomputeTaskStatus(items, taskId) {
  const taskItems = items.filter((i) => i.lead_task_id === taskId)
  if (!taskItems.length) return 'Not started'
  const doneCount = taskItems.filter((i) => i.state === 'done' || i.state === 'na').length
  if (doneCount === taskItems.length) return 'Completed'
  const anyStarted = taskItems.some((i) => i.state !== 'open')
  return anyStarted ? 'In progress' : 'Not started'
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

  const task = await getById('leadTasks', item.lead_task_id)
  const allItems = await getAll('leadChecklistItems')
  const newTaskStatus = recomputeTaskStatus(allItems, task.id)
  if (newTaskStatus !== task.status) {
    await update('leadTasks', task.id, { status: newTaskStatus })
  }

  await logActivity({
    lead_id: task.lead_id, type: 'ChecklistUpdate',
    summary: `"${item.label}" set to ${statusLabel(patch.state)}`, created_by: currentUser.id,
  })
  return updated
}

// A checklist item's free-text note — separate from its status, so jotting a
// note doesn't touch task-status recomputation or the activity feed.
export async function updateChecklistItemNotes(id, notes) {
  return update('leadChecklistItems', id, { notes })
}

// Cross-lead task list (§13 "Task" tab, next to the Leads list) — one row per
// checklist item across every lead visible to the current user, joined with
// its lead/task context. filters: { assignedTo, status['open'|'done'|'all'], q }
export async function listAllChecklistItems(currentUser, filters = {}) {
  const [leads, tasks, items] = await Promise.all([getAll('leads'), getAll('leadTasks'), getAll('leadChecklistItems')])
  const leadIds = visibleLeadIds(currentUser)
  let visibleLeads = leadIds === null ? leads : leads.filter((l) => leadIds.has(l.id))
  visibleLeads = visibleLeads.filter((l) => !l.archived)
  const leadById = Object.fromEntries(visibleLeads.map((l) => [l.id, l]))
  const taskById = Object.fromEntries(tasks.filter((t) => leadById[t.lead_id]).map((t) => [t.id, t]))

  let rows = items
    .filter((i) => taskById[i.lead_task_id])
    .map((i) => {
      const task = taskById[i.lead_task_id]
      const lead = leadById[task.lead_id]
      return {
        id: i.id, state: i.state, label: i.label, requires_file: i.requires_file,
        done_at: i.done_at, task_id: task.id, task_name: task.name,
        lead_id: lead.id, lead_code: lead.code, company_id: lead.company_id, assigned_to: lead.assigned_to,
      }
    })

  if (filters.assignedTo) rows = rows.filter((r) => r.assigned_to === filters.assignedTo)
  if (filters.status === 'open') rows = rows.filter((r) => r.state === 'open' || r.state === 'in_progress')
  else if (filters.status === 'done') rows = rows.filter((r) => r.state === 'done' || r.state === 'na')
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter((r) => r.label.toLowerCase().includes(q) || r.lead_code.toLowerCase().includes(q))
  }
  return rows
}

// Fixed additional input fields for a step (§7.1 Task tab) — not a checklist,
// just a constant set of labelled inputs a rep fills in while working the step.
export async function getLeadTaskFields(taskId) {
  const rows = await getAll('leadTaskFields')
  return rows.filter((f) => f.lead_task_id === taskId).sort((a, b) => a.order - b.order)
}

export async function updateLeadTaskFieldValue(fieldId, value) {
  return update('leadTaskFields', fieldId, { field_value: value })
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
