import { getAll, getById, update } from '../mocks/db'
import { logActivity } from './activities'

export async function getProjectTasks(projectId) {
  const rows = await getAll('projectTasks')
  return rows.filter((t) => t.project_id === projectId).sort((a, b) => a.order - b.order)
}

export async function getProjectChecklist(projectId) {
  const [tasks, items] = await Promise.all([getProjectTasks(projectId), getAll('projectChecklistItems')])
  const taskIds = new Set(tasks.map((t) => t.id))
  return items.filter((i) => taskIds.has(i.project_task_id))
}

function recomputeTaskStatus(items, taskId) {
  const taskItems = items.filter((i) => i.project_task_id === taskId)
  if (!taskItems.length) return 'Not started'
  const doneCount = taskItems.filter((i) => i.state === 'done' || i.state === 'na').length
  if (doneCount === 0) return 'Not started'
  if (doneCount === taskItems.length) return 'Completed'
  return 'In progress'
}

export async function updateChecklistItem(id, patch, currentUser) {
  const item = await getById('projectChecklistItems', id)
  const nextPatch = { ...patch }
  if (patch.state && patch.state !== 'open') {
    nextPatch.done_by = currentUser.id
    nextPatch.done_at = new Date().toISOString()
  } else if (patch.state === 'open') {
    nextPatch.done_by = null
    nextPatch.done_at = null
  }
  const updated = await update('projectChecklistItems', id, nextPatch)

  const task = await getById('projectTasks', item.project_task_id)
  const allItems = await getAll('projectChecklistItems')
  const newTaskStatus = recomputeTaskStatus(allItems, task.id)
  if (newTaskStatus !== task.status) {
    await update('projectTasks', task.id, { status: newTaskStatus })
  }

  const project = await getById('projects', task.project_id)
  await logActivity({
    lead_id: project.lead_id, project_id: task.project_id, type: 'ChecklistUpdate',
    summary: `"${item.label}" marked ${patch.state}`, created_by: currentUser.id,
  })
  return updated
}
