import { getAll, getById, insert, update, genId, peek } from '../mocks/db'
import { visibleLeadIds } from './scope'
import { logActivity } from './activities'
import { notify } from './notifications'

function nextLeadCode(existing) {
  const year = new Date().getFullYear()
  const nums = existing
    .map((l) => l.code.match(/LD-(\d{4})-(\d{4})/))
    .filter(Boolean)
    .map((m) => Number(m[2]))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `LD-${year}-${String(next).padStart(4, '0')}`
}

function companyName(companyId) {
  return peek('companies').find((c) => c.id === companyId)?.name || 'Unknown company'
}

// filters: { status, lead_type_id, owner_id, q }
export async function listLeads(currentUser, filters = {}) {
  const all = await getAll('leads')
  const ids = visibleLeadIds(currentUser)
  let rows = ids === null ? all : all.filter((l) => ids.has(l.id))
  rows = rows.filter((l) => !l.archived)
  if (filters.status) rows = rows.filter((l) => l.status === filters.status)
  if (filters.lead_type_id) rows = rows.filter((l) => l.lead_type_id === filters.lead_type_id)
  if (filters.owner_id) rows = rows.filter((l) => l.owner_id === filters.owner_id)
  if (filters.q) {
    const q = filters.q.toLowerCase()
    rows = rows.filter((l) => l.code.toLowerCase().includes(q) || (l.name || '').toLowerCase().includes(q) || companyName(l.company_id).toLowerCase().includes(q) || l.industry.toLowerCase().includes(q))
  }
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function getLead(id) {
  return getById('leads', id)
}

// §7.1 template instantiation: a lead always ships with exactly one execution
// track. Creating the lead immediately copies its type's task-steps + checklist
// items into lead_tasks / lead_checklist_items as an editable working instance.
export async function createLead(data, currentUser) {
  const existing = peek('leads')
  const row = {
    id: genId('l'),
    code: nextLeadCode(existing),
    name: data.name,
    company_id: data.company_id,
    lead_type_id: data.lead_type_id,
    industry: data.industry,
    domain: data.domain || '',
    product_modules: data.product_modules || [],
    status: 'In Progress',
    priority: data.priority || 'Low',
    owner_id: data.owner_id || currentUser.id,
    source_detail: data.source_detail || '',
    tags: data.tags || [],
    description: data.description || '',
    internal_notes: data.internal_notes || '',
    assigned_to: data.assigned_to,
    start_date: data.start_date || null,
    target_date: data.target_date || null,
    created_by: currentUser.id,
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    next_follow_up: null,
    archived: false,
  }
  const created = await insert('leads', row)

  const taskSteps = peek('taskSteps').filter((s) => s.lead_type_id === row.lead_type_id).sort((a, b) => a.order - b.order)
  const templateItems = peek('checklistTemplateItems')
  const templateFields = peek('taskStepFields')
  for (const step of taskSteps) {
    const task = await insert('leadTasks', {
      id: genId('lt'), lead_id: created.id, source_task_step_id: step.id,
      name: step.name, order: step.order, status: 'Not started',
    })
    const items = templateItems.filter((i) => i.task_step_id === step.id).sort((a, b) => a.order - b.order)
    for (const tmpl of items) {
      await insert('leadChecklistItems', {
        id: genId('lci'), lead_task_id: task.id, label: tmpl.label, order: tmpl.order,
        state: 'open', requires_file: tmpl.requires_file, notify: tmpl.notify, done_by: null, done_at: null,
      })
    }
    const fields = templateFields.filter((f) => f.task_step_id === step.id).sort((a, b) => a.order - b.order)
    for (const tmpl of fields) {
      await insert('leadTaskFields', {
        id: genId('ltf'), lead_task_id: task.id, field_name: tmpl.field_name, field_value: '', order: tmpl.order,
      })
    }
  }

  await logActivity({ lead_id: created.id, type: 'Note', summary: 'Lead created', created_by: currentUser.id })
  if (row.owner_id !== currentUser.id) {
    await notify({ user_id: row.owner_id, type: 'lead_assigned', message: `Lead ${row.code} (${companyName(row.company_id)}) assigned to you`, link: `/leads/${created.id}` })
  }
  if (row.assigned_to !== currentUser.id) {
    await notify({ user_id: row.assigned_to, type: 'assignment', message: `You were assigned to lead ${row.code} (${companyName(row.company_id)})`, link: `/leads/${created.id}` })
  }
  return created
}

export async function updateLead(id, patch, currentUser) {
  const updated = await update('leads', id, { ...patch, last_activity_at: new Date().toISOString() })
  await logActivity({ lead_id: id, type: 'Note', summary: 'Lead details updated', created_by: currentUser.id })
  return updated
}

export async function updateLeadStatus(id, status, currentUser) {
  const before = await getById('leads', id)
  const updated = await update('leads', id, { status, last_activity_at: new Date().toISOString() })
  await logActivity({ lead_id: id, type: 'StatusChange', summary: `Status changed: ${before.status} → ${status}`, created_by: currentUser.id })
  return updated
}

export async function assignLeadOwner(id, ownerId, currentUser) {
  const lead = await getById('leads', id)
  const updated = await update('leads', id, { owner_id: ownerId })
  await logActivity({ lead_id: id, type: 'Assignment', summary: 'Lead owner reassigned', created_by: currentUser.id })
  await notify({ user_id: ownerId, type: 'lead_assigned', message: `Lead ${lead.code} (${companyName(lead.company_id)}) assigned to you`, link: `/leads/${id}` })
  return updated
}

export async function assignLeadRep(id, assignedTo, currentUser) {
  const lead = await getById('leads', id)
  const updated = await update('leads', id, { assigned_to: assignedTo })
  await logActivity({ lead_id: id, type: 'Assignment', summary: 'Lead reassigned to a different representative', created_by: currentUser.id })
  await notify({ user_id: assignedTo, type: 'assignment', message: `You were assigned to lead ${lead.code} (${companyName(lead.company_id)})`, link: `/leads/${id}` })
  return updated
}

export async function archiveLead(id, currentUser) {
  const updated = await update('leads', id, { archived: true })
  await logActivity({ lead_id: id, type: 'Note', summary: 'Lead archived', created_by: currentUser.id })
  return updated
}
