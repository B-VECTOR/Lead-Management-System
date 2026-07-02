// §7 template config — Admin only for global templates (mirrors
// /api/lead-types, /api/lead-types/:id/task-steps, /api/task-steps/:id/checklist-items).
import { getAll, insert, update, remove, genId } from '../mocks/db'

export async function listLeadTypes() {
  const [types, steps, items, customFields] = await Promise.all([
    getAll('leadTypes'), getAll('taskSteps'), getAll('checklistTemplateItems'), getAll('leadTypeCustomFields'),
  ])
  return types.map((t) => ({
    ...t,
    customFields: customFields.filter((f) => f.lead_type_id === t.id),
    taskSteps: steps
      .filter((s) => s.lead_type_id === t.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, checklistItems: items.filter((i) => i.task_step_id === s.id).sort((a, b) => a.order - b.order) })),
  }))
}

export async function createLeadType(data) {
  return insert('leadTypes', { id: genId('lt'), name: data.name, description: data.description || '', active: true })
}

export async function updateLeadType(id, patch) {
  return update('leadTypes', id, patch)
}

export async function createTaskStep(leadTypeId, data, order) {
  return insert('taskSteps', { id: genId('ts'), lead_type_id: leadTypeId, name: data.name, order, description: data.description || '' })
}

export async function updateTaskStep(id, patch) {
  return update('taskSteps', id, patch)
}

export async function deleteTaskStep(id) {
  return remove('taskSteps', id)
}

export async function createChecklistTemplateItem(taskStepId, data, order) {
  return insert('checklistTemplateItems', {
    id: genId('cti'), task_step_id: taskStepId, label: data.label, order,
    requires_file: !!data.requires_file, notify: !!data.notify,
  })
}

export async function updateChecklistTemplateItem(id, patch) {
  return update('checklistTemplateItems', id, patch)
}

export async function deleteChecklistTemplateItem(id) {
  return remove('checklistTemplateItems', id)
}

export async function createLeadTypeCustomField(leadTypeId, data) {
  return insert('leadTypeCustomFields', {
    id: genId('ltcf'), lead_type_id: leadTypeId, field_name: data.field_name,
    field_type: data.field_type || 'text', required: !!data.required, options: data.options || [],
  })
}
