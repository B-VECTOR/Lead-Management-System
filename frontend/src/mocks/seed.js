// Seed data for the mocked API layer.
// Phase 1 model: a Lead IS the unit of work — each lead carries exactly one
// execution track (assigned rep, dates, task/checklist) merged directly onto it.
// There is no separate "Project" entity anymore (see specs.md rework notes).

const now = new Date('2026-07-01T09:00:00Z')
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()
const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString()
// Demo attachments have no real backend file behind them — give them a data
// URL so View/Download in the Files tab has something real to open, same as
// a freshly-uploaded file would.
const demoFileUrl = (text) => `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`

export const BELTS = ['white', 'brown', 'red', 'black']
export const ROLES = ['Admin', 'Manager', 'Representative']

export const users = [
  { id: 'u-meera', name: 'Meera Shah', email: 'meera.shah@company.com', role: 'Admin', belt: 'black', manager_id: null, active: true },
  { id: 'u-priya', name: 'Priya Nair', email: 'priya.nair@company.com', role: 'Manager', belt: 'red', manager_id: null, active: true },
  { id: 'u-arjun', name: 'Arjun Verma', email: 'arjun.verma@company.com', role: 'Manager', belt: 'black', manager_id: null, active: true },
  { id: 'u-rohan', name: 'Rohan Desai', email: 'rohan.desai@company.com', role: 'Representative', belt: 'red', manager_id: 'u-priya', active: true },
  { id: 'u-sana', name: 'Sana Iyer', email: 'sana.iyer@company.com', role: 'Representative', belt: 'red', manager_id: 'u-priya', active: true },
  { id: 'u-vikram', name: 'Vikram Singh', email: 'vikram.singh@company.com', role: 'Representative', belt: 'red', manager_id: 'u-arjun', active: true },
]

export const companies = [
  { id: 'co-technova', name: 'TechNova Retail', industry: 'Retail', domain: 'Store operations', website: 'https://technova.example.com', size: 'Enterprise', location: 'Chicago, IL', created_by: 'u-priya', created_at: daysAgo(220) },
  { id: 'co-medicare', name: 'MediCare Systems', industry: 'Healthcare', domain: 'Patient records', website: 'https://medicaresystems.example.com', size: 'Enterprise', location: 'Boston, MA', created_by: 'u-arjun', created_at: daysAgo(180) },
  { id: 'co-finedge', name: 'FinEdge Capital', industry: 'Finance', domain: 'Payments', website: 'https://finedge.example.com', size: 'Mid', location: 'New York, NY', created_by: 'u-priya', created_at: daysAgo(140) },
  { id: 'co-logitrack', name: 'LogiTrack Freight', industry: 'Logistics', domain: 'Fleet ops', website: 'https://logitrack.example.com', size: 'Enterprise', location: 'Dallas, TX', created_by: 'u-arjun', created_at: daysAgo(160) },
  { id: 'co-bright', name: 'Bright Learning Co', industry: 'Education', domain: 'LMS', website: 'https://brightlearning.example.com', size: 'SMB', location: 'Austin, TX', created_by: 'u-priya', created_at: daysAgo(30) },
]

export const contacts = [
  { id: 'ct-1', company_id: 'co-technova', name: 'Laura Kim', title: 'VP Retail Ops', email: 'laura.kim@technova.example.com', phone: '312-555-0110', decision_role: 'Decision maker', is_primary: true, notes: '' },
  { id: 'ct-2', company_id: 'co-technova', name: 'Dev Patel', title: 'IT Manager', email: 'dev.patel@technova.example.com', phone: '312-555-0111', decision_role: 'Technical', is_primary: false, notes: '' },
  { id: 'ct-3', company_id: 'co-medicare', name: 'Dr. Susan Okafor', title: 'Chief Compliance Officer', email: 'susan.okafor@medicaresystems.example.com', phone: '617-555-0120', decision_role: 'Decision maker', is_primary: true, notes: 'Very focused on HIPAA compliance.' },
  { id: 'ct-4', company_id: 'co-medicare', name: 'Tom Reyes', title: 'Procurement Lead', email: 'tom.reyes@medicaresystems.example.com', phone: '617-555-0121', decision_role: 'Procurement', is_primary: false, notes: '' },
  { id: 'ct-5', company_id: 'co-finedge', name: 'Nina Torres', title: 'Head of Payments', email: 'nina.torres@finedge.example.com', phone: '212-555-0130', decision_role: 'Decision maker', is_primary: true, notes: '' },
  { id: 'ct-6', company_id: 'co-logitrack', name: 'Marcus Webb', title: 'COO', email: 'marcus.webb@logitrack.example.com', phone: '214-555-0140', decision_role: 'Decision maker', is_primary: true, notes: '' },
  { id: 'ct-7', company_id: 'co-logitrack', name: 'Ellen Cho', title: 'Ops Director', email: 'ellen.cho@logitrack.example.com', phone: '214-555-0141', decision_role: 'Influencer', is_primary: false, notes: '' },
  { id: 'ct-8', company_id: 'co-bright', name: 'James Ford', title: 'Academic Director', email: 'james.ford@brightlearning.example.com', phone: '512-555-0150', decision_role: 'User', is_primary: true, notes: '' },
]

// --- Lead type templates (Admin-configured, §7) -----------------------------
// 3 real types for phase 1: BD, Mining, Extension. BD ports the old "New
// Business" worked example (closest match). Mining/Extension are placeholder
// single-step templates — replace their steps/items once the real workflows
// are supplied (edit this file directly; there's no Settings UI in phase 1).

export const leadTypeCustomFields = [
  { id: 'ltcf-1', lead_type_id: 'lt-bd', field_name: 'POC start date', field_type: 'date', required: false, options: [] },
  { id: 'ltcf-2', lead_type_id: 'lt-bd', field_name: 'Compliance review needed?', field_type: 'boolean', required: false, options: [] },
]

export const leadTypes = [
  { id: 'lt-bd', name: 'BD', description: 'Business development — net-new engagement, full cycle from discovery to signed contract.', active: true },
  { id: 'lt-mining', name: 'Mining', description: 'Mining an existing account for expansion opportunities. [PLACEHOLDER — real workflow pending]', active: true },
  { id: 'lt-extension', name: 'Extension', description: 'Extending or renewing an existing engagement. [PLACEHOLDER — real workflow pending]', active: true },
]

export const taskSteps = [
  { id: 'ts-bd-1', lead_type_id: 'lt-bd', name: 'Discovery', order: 1, description: '' },
  { id: 'ts-bd-2', lead_type_id: 'lt-bd', name: 'Demo / Evaluation', order: 2, description: '' },
  { id: 'ts-bd-3', lead_type_id: 'lt-bd', name: 'Proposal', order: 3, description: '' },
  { id: 'ts-bd-4', lead_type_id: 'lt-bd', name: 'Close', order: 4, description: '' },

  { id: 'ts-mining-1', lead_type_id: 'lt-mining', name: 'Getting Started', order: 1, description: 'Placeholder step — replace with the real Mining workflow.' },

  { id: 'ts-ext-1', lead_type_id: 'lt-extension', name: 'Getting Started', order: 1, description: 'Placeholder step — replace with the real Extension workflow.' },
]

export const checklistTemplateItems = [
  { id: 'cti-bd-1', task_step_id: 'ts-bd-1', label: 'Confirm decision maker & authority', order: 1, requires_file: false, notify: true },
  { id: 'cti-bd-2', task_step_id: 'ts-bd-1', label: 'Capture required product modules', order: 2, requires_file: true, notify: false },
  { id: 'cti-bd-3', task_step_id: 'ts-bd-1', label: 'Log budget & timeline', order: 3, requires_file: false, notify: false },

  { id: 'cti-bd-4', task_step_id: 'ts-bd-2', label: 'Schedule product demo', order: 1, requires_file: false, notify: true },
  { id: 'cti-bd-5', task_step_id: 'ts-bd-2', label: 'Deliver demo & capture feedback', order: 2, requires_file: true, notify: false },
  { id: 'cti-bd-6', task_step_id: 'ts-bd-2', label: 'Provision trial/POC access', order: 3, requires_file: false, notify: false },

  { id: 'cti-bd-7', task_step_id: 'ts-bd-3', label: 'Prepare pricing & proposal', order: 1, requires_file: true, notify: false },
  { id: 'cti-bd-8', task_step_id: 'ts-bd-3', label: 'Internal approval', order: 2, requires_file: false, notify: true },
  { id: 'cti-bd-9', task_step_id: 'ts-bd-3', label: 'Send proposal to client', order: 3, requires_file: false, notify: false },

  { id: 'cti-bd-10', task_step_id: 'ts-bd-4', label: 'Negotiate terms', order: 1, requires_file: false, notify: false },
  { id: 'cti-bd-11', task_step_id: 'ts-bd-4', label: 'Collect signed contract', order: 2, requires_file: true, notify: false },
  { id: 'cti-bd-12', task_step_id: 'ts-bd-4', label: 'Handoff to onboarding', order: 3, requires_file: false, notify: true },

  { id: 'cti-mining-1', task_step_id: 'ts-mining-1', label: 'Placeholder checklist item', order: 1, requires_file: false, notify: false },
  { id: 'cti-mining-2', task_step_id: 'ts-mining-1', label: 'Placeholder checklist item', order: 2, requires_file: false, notify: false },

  { id: 'cti-ext-1', task_step_id: 'ts-ext-1', label: 'Placeholder checklist item', order: 1, requires_file: false, notify: false },
  { id: 'cti-ext-2', task_step_id: 'ts-ext-1', label: 'Placeholder checklist item', order: 2, requires_file: false, notify: false },
]

// Fixed additional input fields per step (§7.1 Task tab) — not a checklist;
// always the same shape for a given step, just data entry (e.g. contract
// value). Admin-configured in the template, same pattern as checklist items.
export const taskStepFields = [
  { id: 'tsf-bd-1-1', task_step_id: 'ts-bd-1', field_name: 'Budget confirmed ($)', order: 1 },
  { id: 'tsf-bd-1-2', task_step_id: 'ts-bd-1', field_name: 'Timeline (weeks)', order: 2 },

  { id: 'tsf-bd-2-1', task_step_id: 'ts-bd-2', field_name: 'Demo date', order: 1 },
  { id: 'tsf-bd-2-2', task_step_id: 'ts-bd-2', field_name: 'Attendees', order: 2 },

  { id: 'tsf-bd-3-1', task_step_id: 'ts-bd-3', field_name: 'Proposal amount ($)', order: 1 },
  { id: 'tsf-bd-3-2', task_step_id: 'ts-bd-3', field_name: 'Discount (%)', order: 2 },

  { id: 'tsf-bd-4-1', task_step_id: 'ts-bd-4', field_name: 'Contract value ($)', order: 1 },
  { id: 'tsf-bd-4-2', task_step_id: 'ts-bd-4', field_name: 'PO number', order: 2 },

  { id: 'tsf-mining-1-1', task_step_id: 'ts-mining-1', field_name: 'Notes', order: 1 },

  { id: 'tsf-ext-1-1', task_step_id: 'ts-ext-1', field_name: 'Notes', order: 1 },
]

export const PRODUCT_MODULES = ['Analytics', 'Payments', 'Inventory', 'Workforce', 'Compliance', 'Reporting', 'Integrations', 'Mobile App']
export const LEAD_STATUSES = ['In Progress', 'On Hold', 'Dropped', 'Completed']
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
// Derived from the domain values already present in demo data — add/remove as needed.
export const DOMAINS = ['Store operations', 'Patient records', 'Payments', 'Fleet ops', 'LMS']

// Checklist item status (Task tab) — separate scale from the lead's own status (§8).
export const CHECKLIST_ITEM_STATUSES = [
  { value: 'open', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Completed' },
  { value: 'na', label: 'N/A' },
]

// --- Leads (merged lead + execution fields) -----------------------------------

export const leads = [
  {
    id: 'l-1', code: 'LD-2026-0001', name: 'Store Analytics Rollout', company_id: 'co-technova',
    lead_type_id: 'lt-bd', industry: 'Retail', domain: 'Store operations', product_modules: ['Analytics', 'Reporting'],
    status: 'In Progress', priority: 'Medium', owner_id: 'u-priya', source_detail: 'Inbound — website demo request', tags: ['expansion-potential'],
    description: 'Rolling out real-time store analytics across 120 locations.', internal_notes: 'Champion is Laura Kim; IT sign-off pending.',
    assigned_to: 'u-rohan', start_date: daysAgo(30), target_date: daysFromNow(30),
    created_by: 'u-priya', created_at: daysAgo(30), last_activity_at: daysAgo(2), next_follow_up: daysFromNow(3), archived: false,
  },
  {
    id: 'l-2', code: 'LD-2026-0002', name: 'HIPAA Compliance Suite', company_id: 'co-medicare',
    lead_type_id: 'lt-bd', industry: 'Healthcare', domain: 'Patient records', product_modules: ['Compliance', 'Reporting'],
    status: 'In Progress', priority: 'High', owner_id: 'u-arjun', source_detail: 'Referral by existing customer', tags: ['hipaa', 'strategic'],
    description: 'Compliance suite for HIPAA audit readiness across all facilities.', internal_notes: 'Legal review requested on our side too.',
    assigned_to: 'u-vikram', start_date: daysAgo(55), target_date: daysFromNow(20),
    created_by: 'u-arjun', created_at: daysAgo(55), last_activity_at: daysAgo(1), next_follow_up: daysFromNow(2), archived: false,
  },
  {
    id: 'l-3', code: 'LD-2026-0003', name: 'Reconciliation Dashboard Mining', company_id: 'co-finedge',
    lead_type_id: 'lt-mining', industry: 'Finance', domain: 'Payments', product_modules: ['Payments', 'Analytics'],
    status: 'In Progress', priority: 'Low', owner_id: 'u-priya', source_detail: 'Outbound prospecting', tags: [],
    description: 'Mining FinEdge for a second module — reconciliation dashboard.', internal_notes: '',
    assigned_to: 'u-sana', start_date: daysAgo(18), target_date: daysFromNow(45),
    created_by: 'u-priya', created_at: daysAgo(18), last_activity_at: daysAgo(4), next_follow_up: daysFromNow(5), archived: false,
  },
  {
    id: 'l-4', code: 'LD-2026-0004', name: 'Fleet Ops Portal Extension', company_id: 'co-logitrack',
    lead_type_id: 'lt-extension', industry: 'Logistics', domain: 'Fleet ops', product_modules: ['Workforce', 'Integrations', 'Mobile App'],
    status: 'In Progress', priority: 'Urgent', owner_id: 'u-arjun', source_detail: 'Existing customer — renewal', tags: ['expansion'],
    description: 'Extending ops portal coverage to 3 more regional hubs.', internal_notes: 'Redlines with legal in progress.',
    assigned_to: 'u-rohan', start_date: daysAgo(75), target_date: daysFromNow(10),
    created_by: 'u-arjun', created_at: daysAgo(75), last_activity_at: daysAgo(1), next_follow_up: daysFromNow(1), archived: false,
  },
  {
    id: 'l-5', code: 'LD-2026-0005', name: 'Campus LMS Pilot', company_id: 'co-bright',
    lead_type_id: 'lt-bd', industry: 'Education', domain: 'LMS', product_modules: ['Reporting'],
    status: 'In Progress', priority: 'Low', owner_id: 'u-priya', source_detail: 'Inbound — contact form', tags: [],
    description: 'Small pilot for a single campus before wider rollout.', internal_notes: '',
    assigned_to: 'u-sana', start_date: daysAgo(5), target_date: daysFromNow(60),
    created_by: 'u-priya', created_at: daysAgo(5), last_activity_at: daysAgo(5), next_follow_up: daysFromNow(7), archived: false,
  },
  {
    id: 'l-6', code: 'LD-2026-0006', name: 'Warehouse Inventory Upsell', company_id: 'co-technova',
    lead_type_id: 'lt-bd', industry: 'Retail', domain: 'Store operations', product_modules: ['Inventory'],
    status: 'Completed', priority: 'Medium', owner_id: 'u-priya', source_detail: 'Existing customer — upsell', tags: [],
    description: 'Added warehouse inventory module to existing footprint.', internal_notes: 'Fast 3-week cycle, signed at list price.',
    assigned_to: 'u-sana', start_date: daysAgo(55), target_date: daysAgo(12),
    created_by: 'u-priya', created_at: daysAgo(55), last_activity_at: daysAgo(10), next_follow_up: null, archived: false,
  },
  {
    id: 'l-7', code: 'LD-2026-0007', name: 'Legacy Payments Migration', company_id: 'co-finedge',
    lead_type_id: 'lt-bd', industry: 'Finance', domain: 'Payments', product_modules: ['Payments'],
    status: 'Dropped', priority: 'Low', owner_id: 'u-arjun', source_detail: 'Outbound prospecting', tags: [],
    description: 'Migration off legacy in-house payments tooling.', internal_notes: 'Budget got pulled after Q2 review.',
    assigned_to: 'u-vikram', start_date: daysAgo(80), target_date: daysAgo(15),
    created_by: 'u-arjun', created_at: daysAgo(80), last_activity_at: daysAgo(15), next_follow_up: null, archived: false,
  },
  {
    id: 'l-8', code: 'LD-2026-0008', name: 'Patient Analytics Expansion', company_id: 'co-medicare',
    lead_type_id: 'lt-mining', industry: 'Healthcare', domain: 'Patient records', product_modules: ['Analytics'],
    status: 'On Hold', priority: 'Medium', owner_id: 'u-arjun', source_detail: 'Existing customer — upsell', tags: [],
    description: 'Paused pending Q3 budget confirmation on their side.', internal_notes: '',
    assigned_to: 'u-vikram', start_date: daysAgo(40), target_date: daysFromNow(90),
    created_by: 'u-arjun', created_at: daysAgo(40), last_activity_at: daysAgo(20), next_follow_up: daysFromNow(30), archived: false,
  },
]

// --- Task/checklist working instances (one set per lead) ---------------------

function makeLeadTasksAndItems(leadId, leadTypeId, doneCounts) {
  // doneCounts: how many items in each of this type's steps are marked done, in order
  const tasks = []
  const items = []
  const fields = []
  const stepsForType = taskSteps.filter((s) => s.lead_type_id === leadTypeId).sort((a, b) => a.order - b.order)
  stepsForType.forEach((step, stepIdx) => {
    const taskId = `${leadId}-t-${stepIdx + 1}`
    const stepItems = checklistTemplateItems.filter((c) => c.task_step_id === step.id)
    const doneN = doneCounts[stepIdx] ?? 0
    let taskStatus = 'Not started'
    if (doneN >= stepItems.length) taskStatus = 'Completed'
    else if (doneN > 0) taskStatus = 'In progress'
    tasks.push({ id: taskId, lead_id: leadId, source_task_step_id: step.id, name: step.name, order: step.order, status: taskStatus })
    stepItems.forEach((tmpl, i) => {
      items.push({
        id: `${taskId}-ci-${i + 1}`,
        lead_task_id: taskId,
        label: tmpl.label,
        order: tmpl.order,
        state: i < doneN ? 'done' : 'open',
        requires_file: tmpl.requires_file,
        notify: tmpl.notify,
        done_by: i < doneN ? 'u-rohan' : null,
        done_at: i < doneN ? daysAgo(10 - i) : null,
      })
    })
    const stepFields = taskStepFields.filter((f) => f.task_step_id === step.id).sort((a, b) => a.order - b.order)
    stepFields.forEach((tmpl) => {
      fields.push({ id: `${taskId}-f-${tmpl.order}`, lead_task_id: taskId, field_name: tmpl.field_name, field_value: '', order: tmpl.order })
    })
  })
  return { tasks, items, fields }
}

const t1 = makeLeadTasksAndItems('l-1', 'lt-bd', [3, 1, 0, 0])
const t2 = makeLeadTasksAndItems('l-2', 'lt-bd', [3, 3, 1, 0])
const t3 = makeLeadTasksAndItems('l-3', 'lt-mining', [1])
const t4 = makeLeadTasksAndItems('l-4', 'lt-extension', [1])
const t5 = makeLeadTasksAndItems('l-5', 'lt-bd', [0, 0, 0, 0])
const t6 = makeLeadTasksAndItems('l-6', 'lt-bd', [3, 3, 3, 3])
const t7 = makeLeadTasksAndItems('l-7', 'lt-bd', [1, 0, 0, 0])
const t8 = makeLeadTasksAndItems('l-8', 'lt-mining', [0])

export const leadTasks = [...t1.tasks, ...t2.tasks, ...t3.tasks, ...t4.tasks, ...t5.tasks, ...t6.tasks, ...t7.tasks, ...t8.tasks]
export const leadChecklistItems = [...t1.items, ...t2.items, ...t3.items, ...t4.items, ...t5.items, ...t6.items, ...t7.items, ...t8.items]
export const leadTaskFields = [...t1.fields, ...t2.fields, ...t3.fields, ...t4.fields, ...t5.fields, ...t6.fields, ...t7.fields, ...t8.fields]

// Fill in a couple of example values on the already-completed Discovery step
// of l-1 so the feature shows real data out of the box.
const l1DiscoveryFields = leadTaskFields.filter((f) => f.lead_task_id === 'l-1-t-1')
if (l1DiscoveryFields[0]) l1DiscoveryFields[0].field_value = '150000'
if (l1DiscoveryFields[1]) l1DiscoveryFields[1].field_value = '12'

export const leadCustomValues = [
  { id: 'lcv-1', lead_id: 'l-1', custom_field_id: 'ltcf-1', value: daysFromNow(14) },
  { id: 'lcv-2', lead_id: 'l-1', custom_field_id: 'ltcf-2', value: 'false' },
  { id: 'lcv-3', lead_id: 'l-2', custom_field_id: 'ltcf-2', value: 'true' },
]

// --- Cross-cutting -------------------------------------------------------------

export const attachments = [
  { id: 'att-1', entity_type: 'checklist_item', entity_id: 'l-1-t-1-ci-2', filename: 'technova-requirements.pdf', title: null, url: demoFileUrl('Demo placeholder for technova-requirements.pdf'), uploaded_by: 'u-rohan', uploaded_at: daysAgo(20) },
  { id: 'att-2', entity_type: 'lead', entity_id: 'l-2', filename: 'medicare-rfp.pdf', title: 'MediCare RFP (original)', url: demoFileUrl('Demo placeholder for medicare-rfp.pdf'), uploaded_by: 'u-arjun', uploaded_at: daysAgo(60) },
  { id: 'att-3', entity_type: 'lead', entity_id: 'l-2', filename: 'compliance-suite-scope.docx', title: 'Compliance suite — scope doc', url: demoFileUrl('Demo placeholder for compliance-suite-scope.docx'), uploaded_by: 'u-vikram', uploaded_at: daysAgo(40) },
]

export const activities = [
  { id: 'a-1', lead_id: 'l-1', type: 'Assignment', summary: 'Assigned to Rohan Desai', body: '', created_by: 'u-priya', created_at: daysAgo(30) },
  { id: 'a-2', lead_id: 'l-1', type: 'ChecklistUpdate', summary: 'Discovery: 3/3 items completed', body: '', created_by: 'u-rohan', created_at: daysAgo(10) },
  { id: 'a-3', lead_id: 'l-1', type: 'Call', summary: 'Discovery call with Laura Kim', body: 'Walked through analytics requirements; needs board-level reporting.', created_by: 'u-priya', created_at: daysAgo(2) },
  { id: 'a-4', lead_id: 'l-2', type: 'Note', summary: 'Legal flagged data residency clause', body: 'Need US-only hosting confirmed in contract.', created_by: 'u-arjun', created_at: daysAgo(5) },
  { id: 'a-5', lead_id: 'l-2', type: 'ChecklistUpdate', summary: 'Demo / Evaluation: 3/3 items completed', body: '', created_by: 'u-vikram', created_at: daysAgo(15) },
  { id: 'a-6', lead_id: 'l-4', type: 'StatusChange', summary: 'Status changed: On Hold → In Progress', body: '', created_by: 'u-arjun', created_at: daysAgo(8) },
  { id: 'a-7', lead_id: 'l-6', type: 'StatusChange', summary: 'Status changed: In Progress → Completed', body: '', created_by: 'u-priya', created_at: daysAgo(10) },
  { id: 'a-8', lead_id: 'l-7', type: 'StatusChange', summary: 'Status changed: In Progress → Dropped', body: 'Budget got pulled after Q2 review.', created_by: 'u-arjun', created_at: daysAgo(15) },
]

export const followups = [
  { id: 'f-1', lead_id: 'l-1', title: 'Send updated pricing sheet to Laura Kim', due_date: daysFromNow(3), assigned_to: 'u-priya', done: false, reminder_at: daysFromNow(2) },
  { id: 'f-2', lead_id: 'l-2', title: 'Follow up on legal redlines', due_date: daysAgo(1), assigned_to: 'u-arjun', done: false, reminder_at: daysAgo(1) },
  { id: 'f-3', lead_id: 'l-1', title: 'Upload signed NDA before kickoff', due_date: daysFromNow(1), assigned_to: 'u-rohan', done: false, reminder_at: daysFromNow(1) },
  { id: 'f-4', lead_id: 'l-4', title: 'Confirm final seat count with Marcus', due_date: daysAgo(2), assigned_to: 'u-arjun', done: false, reminder_at: daysAgo(2) },
  { id: 'f-5', lead_id: 'l-3', title: 'Share POC access credentials', due_date: daysFromNow(5), assigned_to: 'u-sana', done: false, reminder_at: daysFromNow(4) },
  { id: 'f-6', lead_id: 'l-5', title: 'Qualify budget with James Ford', due_date: daysFromNow(7), assigned_to: 'u-priya', done: true, reminder_at: null },
]

export const notifications = [
  { id: 'n-1', user_id: 'u-rohan', type: 'assignment', message: 'You were assigned to lead LD-2026-0001 (TechNova Retail)', link: '/leads/l-1', read: true, created_at: daysAgo(30) },
  { id: 'n-2', user_id: 'u-rohan', type: 'checklist', message: '"Confirm decision maker & authority" needs action', link: '/leads/l-1', read: false, created_at: daysAgo(28) },
  { id: 'n-3', user_id: 'u-rohan', type: 'followup', message: 'Follow-up due: Upload signed NDA before kickoff', link: '/leads/l-1', read: false, created_at: daysFromNow(1) },
  { id: 'n-4', user_id: 'u-vikram', type: 'assignment', message: 'You were assigned to lead LD-2026-0002 (MediCare Systems)', link: '/leads/l-2', read: true, created_at: daysAgo(55) },
  { id: 'n-5', user_id: 'u-arjun', type: 'followup', message: 'Follow-up overdue: Follow up on legal redlines', link: '/leads/l-2', read: false, created_at: daysAgo(1) },
  { id: 'n-6', user_id: 'u-priya', type: 'lead_assigned', message: 'Lead LD-2026-0005 (Bright Learning Co) assigned to you', link: '/leads/l-5', read: false, created_at: daysAgo(5) },
  { id: 'n-7', user_id: 'u-sana', type: 'assignment', message: 'You were assigned to lead LD-2026-0003 (FinEdge Capital)', link: '/leads/l-3', read: false, created_at: daysAgo(18) },
]
