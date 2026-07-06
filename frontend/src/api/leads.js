import { getAll, getById, insert, update, genId, peek } from '../mocks/db'
import { visibleLeadIds } from './scope'
import { logActivity } from './activities'
import { notify } from './notifications'
import { createFollowup } from './followups'

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

function normalizeConversionReminder(value) {
  return value === 'mining' || value === 'extension' ? value : null
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

// BD leads can carry a one-shot reminder to revisit converting them into a
// Mining or Extension engagement (§ future-phase note) — 6 months after the
// start date for Mining, or 2 months before the target date for Extension.
// Surfaced as a regular follow-up so it shows up in the existing Additional
// Task list rather than needing a new notification pipeline.
async function scheduleConversionReminder(lead, currentUser) {
  const isMining = lead.conversion_reminder === 'mining'
  const sourceDate = isMining ? lead.start_date : lead.target_date
  if (!sourceDate) return
  const due_date = addMonths(sourceDate, isMining ? 6 : -2)
  const title = isMining ? `Consider converting ${lead.code} to Mining` : `Consider converting ${lead.code} to Extension`
  await createFollowup({ lead_id: lead.id, title, due_date, assigned_to: lead.assigned_to || lead.owner_id }, currentUser)
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
    division: data.division || '',
    scope: data.scope || '',
    conversion_reminder: normalizeConversionReminder(data.conversion_reminder),
    status: 'In Progress',
    priority: data.priority || 'Medium',
    owner_id: data.owner_id || currentUser.id,
    source_detail: data.source_detail || '',
    tags: data.tags || [],
    description: data.description || '',
    internal_notes: data.internal_notes || '',
    assigned_to: data.assigned_to || null,
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
      branch_field_id: step.branch_field_id || null,
      branch_map: step.branch_map ? { ...step.branch_map } : null,
    })
    const items = templateItems.filter((i) => i.task_step_id === step.id).sort((a, b) => a.order - b.order)
    for (const tmpl of items) {
      await insert('leadChecklistItems', {
        id: genId('lci'), lead_task_id: task.id, label: tmpl.label, order: tmpl.order,
        state: 'open', requires_file: tmpl.requires_file, notes: '', done_by: null, done_at: null,
      })
    }
    const fields = templateFields.filter((f) => f.task_step_id === step.id).sort((a, b) => a.order - b.order)
    for (const tmpl of fields) {
      // A repeatable group's "empty" state is a fixed number of blank rows
      // (so the table renders with its default row count), not an empty string.
      const initialValue = tmpl.field_type === 'repeatable_group'
        ? JSON.stringify(Array.from({ length: tmpl.default_rows || 0 }, () => Object.fromEntries((tmpl.columns || []).map((c) => [c.key, '']))))
        : ''
      await insert('leadTaskFields', {
        id: genId('ltf'), lead_task_id: task.id, field_name: tmpl.field_name,
        field_type: tmpl.field_type || 'text', field_value: initialValue, order: tmpl.order,
        source_field_id: tmpl.id,
        visible_if_field_id: tmpl.visible_if_field_id || null,
        visible_if_value: tmpl.visible_if_value || null,
        columns: tmpl.columns || null,
      })
    }
  }

  await logActivity({ lead_id: created.id, type: 'Note', summary: 'Lead created', created_by: currentUser.id })
  if (row.owner_id !== currentUser.id) {
    await notify({ user_id: row.owner_id, type: 'lead_assigned', message: `Lead ${row.code} (${companyName(row.company_id)}) assigned to you`, link: `/leads/${created.id}` })
  }
  if (row.assigned_to && row.assigned_to !== currentUser.id) {
    await notify({ user_id: row.assigned_to, type: 'assignment', message: `You were assigned to lead ${row.code} (${companyName(row.company_id)})`, link: `/leads/${created.id}` })
  }
  if (row.conversion_reminder) {
    await scheduleConversionReminder(created, currentUser)
  }
  return created
}

export async function updateLead(id, patch, currentUser) {
  const before = await getById('leads', id)
  const nextPatch = { ...patch, conversion_reminder: normalizeConversionReminder(patch.conversion_reminder), assigned_to: patch.assigned_to || null }
  const updated = await update('leads', id, { ...nextPatch, last_activity_at: new Date().toISOString() })
  await logActivity({ lead_id: id, type: 'Note', summary: 'Lead details updated', created_by: currentUser.id })
  if (nextPatch.conversion_reminder && nextPatch.conversion_reminder !== before.conversion_reminder) {
    await scheduleConversionReminder(updated, currentUser)
  }
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
