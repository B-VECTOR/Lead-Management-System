// Workflow tasks & checklists, wired to the real Django REST backend (Phase 4).
//
// The backend owns the BD workflow engine: Task 1 opens when a lead gains an
// owner, closing a task validates its checklist + mandatory fields and opens
// the next task(s) per the workflow routing/branch rules. This module is the
// thin transport for the task stepper — it no longer touches the localStorage
// mock (`api/checklist.js` is retired for backend leads).
import client from './client'

// DRF errors come back as nested { field: [msg] } / { field: {sub: msg} }
// structures — dig out the first human-readable string so the toast shows
// something better than axios's generic status-code message.
function firstMessage(data) {
  if (data == null) return null
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return firstMessage(data[0])
  if (typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const msg = firstMessage(data[key])
      if (msg) return msg
    }
  }
  return null
}

function throwApiError(err) {
  const msg = firstMessage(err.response?.data)
  throw new Error(msg || 'Something went wrong. Please try again.')
}

export async function listLeadTasks(leadId) {
  const { data } = await client.get(`/api/leads/${leadId}/tasks/`)
  return Array.isArray(data) ? data : data.results || []
}

// Save as Draft — persists field values without closing the task.
export async function saveTaskDraft(taskId, extraFields) {
  try {
    const { data } = await client.patch(`/api/tasks/${taskId}/`, { extra_fields: extraFields })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// Save & Complete — validates + closes the task and opens the next one(s).
export async function completeTask(taskId) {
  try {
    const { data } = await client.post(`/api/tasks/${taskId}/complete/`)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function reassignTask(taskId, userId, remark) {
  try {
    const body = { assigned_to: userId }
    if (remark) body.remark = remark
    const { data } = await client.post(`/api/tasks/${taskId}/reassign/`, body)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// Checklist item: status (not_started / inprogress / complete) + remark, saved
// independently of task closure.
export async function updateChecklistItem(itemId, patch) {
  try {
    const { data } = await client.patch(`/api/checklist-items/${itemId}/`, patch)
    return data
  } catch (err) {
    throwApiError(err)
  }
}
