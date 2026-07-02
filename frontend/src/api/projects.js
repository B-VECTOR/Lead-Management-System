import { getAll, getById, insert, update, genId, peek } from '../mocks/db'
import { visibleProjectIds } from './scope'
import { logActivity } from './activities'
import { notify } from './notifications'

export async function listProjectsForLead(leadId) {
  const rows = await getAll('projects')
  return rows.filter((p) => p.lead_id === leadId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function listProjects(currentUser, filters = {}) {
  const rows = await getAll('projects')
  const ids = visibleProjectIds(currentUser)
  let visible = ids === null ? rows : rows.filter((p) => ids.has(p.id))
  if (filters.assigned_to) visible = visible.filter((p) => p.assigned_to === filters.assigned_to)
  if (filters.status) visible = visible.filter((p) => p.status === filters.status)
  return visible
}

export async function getProject(id) {
  return getById('projects', id)
}

// §7.1 template instantiation: copies the lead type's task-steps + checklist
// items into project_tasks / project_checklist_items as an editable working copy.
export async function createProject(leadId, data, currentUser) {
  const lead = await getById('leads', leadId)
  const taskSteps = peek('taskSteps').filter((s) => s.lead_type_id === lead.lead_type_id).sort((a, b) => a.order - b.order)
  const templateItems = peek('checklistTemplateItems')

  const project = await insert('projects', {
    id: genId('p'), lead_id: leadId, name: data.name, description: data.description || '',
    status: 'Not started', assigned_to: data.assigned_to || null,
    start_date: data.start_date || null, target_date: data.target_date || null,
    created_by: currentUser.id, created_at: new Date().toISOString(),
  })

  for (const step of taskSteps) {
    const task = await insert('projectTasks', {
      id: genId('pt'), project_id: project.id, source_task_step_id: step.id,
      name: step.name, order: step.order, status: 'Not started', assigned_to: data.assigned_to || null,
    })
    const items = templateItems.filter((i) => i.task_step_id === step.id).sort((a, b) => a.order - b.order)
    for (const tmpl of items) {
      await insert('projectChecklistItems', {
        id: genId('pci'), project_task_id: task.id, label: tmpl.label, order: tmpl.order,
        state: 'open', requires_file: tmpl.requires_file, notify: tmpl.notify, done_by: null, done_at: null,
      })
    }
  }

  await logActivity({ lead_id: leadId, project_id: project.id, type: 'Note', summary: `Project "${project.name}" created`, created_by: currentUser.id })
  if (data.assigned_to) {
    await notify({ user_id: data.assigned_to, type: 'assignment', message: `You were assigned to project "${project.name}"`, link: `/projects/${project.id}` })
  }
  return project
}

export async function updateProject(id, patch, currentUser) {
  const updated = await update('projects', id, patch)
  await logActivity({ lead_id: updated.lead_id, project_id: id, type: 'Note', summary: 'Project details updated', created_by: currentUser.id })
  return updated
}

export async function assignProject(id, assignedTo, currentUser) {
  const project = await getById('projects', id)
  const updated = await update('projects', id, { assigned_to: assignedTo })
  await logActivity({ lead_id: project.lead_id, project_id: id, type: 'Assignment', summary: 'Project reassigned', created_by: currentUser.id })
  await notify({ user_id: assignedTo, type: 'assignment', message: `You were assigned to project "${project.name}"`, link: `/projects/${id}` })
  return updated
}

export function projectProgress(projectId) {
  const items = peek('projectChecklistItems').filter((i) => {
    const task = peek('projectTasks').find((t) => t.id === i.project_task_id)
    return task && task.project_id === projectId
  })
  if (!items.length) return 0
  const done = items.filter((i) => i.state === 'done' || i.state === 'na').length
  return Math.round((done / items.length) * 100)
}
