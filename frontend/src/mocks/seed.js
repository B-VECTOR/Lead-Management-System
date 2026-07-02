// Seed data for the mocked API layer.
// Shape mirrors specs.md §14 (relational data model) as closely as practical for JSON.
// Replace/extend via the Admin > Settings screens once the real Django API is wired in.

const now = new Date('2026-07-01T09:00:00Z')
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()
const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString()

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
// Seeded with the one worked example from specs.md §7.3 ("New Business").
// Add the real 3 lead types later via Settings > Lead Types — no code changes needed.

export const leadTypeCustomFields = [
  { id: 'ltcf-1', lead_type_id: 'lt-new-business', field_name: 'POC start date', field_type: 'date', required: false, options: [] },
  { id: 'ltcf-2', lead_type_id: 'lt-new-business', field_name: 'Compliance review needed?', field_type: 'boolean', required: false, options: [] },
]

export const leadTypes = [
  { id: 'lt-new-business', name: 'New Business', description: 'Net-new logo, full sales cycle from discovery to signed contract.', active: true },
]

export const taskSteps = [
  { id: 'ts-1', lead_type_id: 'lt-new-business', name: 'Discovery', order: 1, description: '' },
  { id: 'ts-2', lead_type_id: 'lt-new-business', name: 'Demo / Evaluation', order: 2, description: '' },
  { id: 'ts-3', lead_type_id: 'lt-new-business', name: 'Proposal', order: 3, description: '' },
  { id: 'ts-4', lead_type_id: 'lt-new-business', name: 'Close', order: 4, description: '' },
]

export const checklistTemplateItems = [
  { id: 'cti-1', task_step_id: 'ts-1', label: 'Confirm decision maker & authority', order: 1, requires_file: false, notify: true },
  { id: 'cti-2', task_step_id: 'ts-1', label: 'Capture required product modules', order: 2, requires_file: true, notify: false },
  { id: 'cti-3', task_step_id: 'ts-1', label: 'Log budget & timeline', order: 3, requires_file: false, notify: false },

  { id: 'cti-4', task_step_id: 'ts-2', label: 'Schedule product demo', order: 1, requires_file: false, notify: true },
  { id: 'cti-5', task_step_id: 'ts-2', label: 'Deliver demo & capture feedback', order: 2, requires_file: true, notify: false },
  { id: 'cti-6', task_step_id: 'ts-2', label: 'Provision trial/POC access', order: 3, requires_file: false, notify: false },

  { id: 'cti-7', task_step_id: 'ts-3', label: 'Prepare pricing & proposal', order: 1, requires_file: true, notify: false },
  { id: 'cti-8', task_step_id: 'ts-3', label: 'Internal approval', order: 2, requires_file: false, notify: true },
  { id: 'cti-9', task_step_id: 'ts-3', label: 'Send proposal to client', order: 3, requires_file: false, notify: false },

  { id: 'cti-10', task_step_id: 'ts-4', label: 'Negotiate terms', order: 1, requires_file: false, notify: false },
  { id: 'cti-11', task_step_id: 'ts-4', label: 'Collect signed contract', order: 2, requires_file: true, notify: false },
  { id: 'cti-12', task_step_id: 'ts-4', label: 'Handoff to onboarding', order: 3, requires_file: false, notify: true },
]

export const PRODUCT_MODULES = ['Analytics', 'Payments', 'Inventory', 'Workforce', 'Compliance', 'Reporting', 'Integrations', 'Mobile App']
export const PLAN_TIERS = ['Starter', 'Pro', 'Enterprise']
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Demo/Evaluation', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost', 'On Hold']
export const PROJECT_STATUSES = ['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled']
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
export const LOST_REASONS = ['Budget', 'Timing', 'Competitor', 'No response', 'Not a fit', 'Other']

// --- Leads -------------------------------------------------------------------

export const leads = [
  {
    id: 'l-1', code: 'LD-2026-0001', company_id: 'co-technova',
    lead_type_id: 'lt-new-business', industry: 'Retail', domain: 'Store operations', product_modules: ['Analytics', 'Reporting'],
    status: 'Qualified', priority: 'Medium', owner_id: 'u-priya', source_detail: 'Inbound — website demo request', tags: ['expansion-potential'],
    plan: 'Pro', seats: 120, billing_cycle: 'Annual', acv: 84000, contract_length: 12, currency: 'USD',
    expected_close_date: daysFromNow(35), renewal_date: null, probability: 40,
    description: 'Rolling out real-time store analytics across 120 locations.', internal_notes: 'Champion is Laura Kim; IT sign-off pending.',
    lost_reason: null, won_notes: null, created_by: 'u-priya', created_at: daysAgo(45), last_activity_at: daysAgo(2), next_follow_up: daysFromNow(3), archived: false,
  },
  {
    id: 'l-2', code: 'LD-2026-0002', company_id: 'co-medicare',
    lead_type_id: 'lt-new-business', industry: 'Healthcare', domain: 'Patient records', product_modules: ['Compliance', 'Reporting'],
    status: 'Proposal', priority: 'High', owner_id: 'u-arjun', source_detail: 'Referral by existing customer', tags: ['hipaa', 'strategic'],
    plan: 'Enterprise', seats: 400, billing_cycle: 'Annual', acv: 220000, contract_length: 24, currency: 'USD',
    expected_close_date: daysFromNow(20), renewal_date: null, probability: 60,
    description: 'Compliance suite for HIPAA audit readiness across all facilities.', internal_notes: 'Legal review requested on our side too.',
    lost_reason: null, won_notes: null, created_by: 'u-arjun', created_at: daysAgo(70), last_activity_at: daysAgo(1), next_follow_up: daysFromNow(2), archived: false,
  },
  {
    id: 'l-3', code: 'LD-2026-0003', company_id: 'co-finedge',
    lead_type_id: 'lt-new-business', industry: 'Finance', domain: 'Payments', product_modules: ['Payments', 'Analytics'],
    status: 'Demo/Evaluation', priority: 'Low', owner_id: 'u-priya', source_detail: 'Outbound prospecting', tags: [],
    plan: 'Pro', seats: 60, billing_cycle: 'Monthly', acv: 60000, contract_length: 12, currency: 'USD',
    expected_close_date: daysFromNow(50), renewal_date: null, probability: 25,
    description: 'Unified payments dashboard for reconciliation team.', internal_notes: '',
    lost_reason: null, won_notes: null, created_by: 'u-priya', created_at: daysAgo(25), last_activity_at: daysAgo(4), next_follow_up: daysFromNow(5), archived: false,
  },
  {
    id: 'l-4', code: 'LD-2026-0004', company_id: 'co-logitrack',
    lead_type_id: 'lt-new-business', industry: 'Logistics', domain: 'Fleet ops', product_modules: ['Workforce', 'Integrations', 'Mobile App'],
    status: 'Negotiation', priority: 'Urgent', owner_id: 'u-arjun', source_detail: 'Existing customer — upsell', tags: ['expansion'],
    plan: 'Enterprise', seats: 250, billing_cycle: 'Annual', acv: 150000, contract_length: 36, currency: 'USD',
    expected_close_date: daysFromNow(10), renewal_date: daysFromNow(400), probability: 75,
    description: 'Expanding ops portal to cover 3 more regional hubs.', internal_notes: 'Redlines with legal in progress.',
    lost_reason: null, won_notes: null, created_by: 'u-arjun', created_at: daysAgo(90), last_activity_at: daysAgo(1), next_follow_up: daysFromNow(1), archived: false,
  },
  {
    id: 'l-5', code: 'LD-2026-0005', company_id: 'co-bright',
    lead_type_id: 'lt-new-business', industry: 'Education', domain: 'LMS', product_modules: ['Reporting'],
    status: 'New', priority: 'Low', owner_id: 'u-priya', source_detail: 'Inbound — contact form', tags: [],
    plan: 'Starter', seats: 30, billing_cycle: 'Monthly', acv: 18000, contract_length: 12, currency: 'USD',
    expected_close_date: daysFromNow(60), renewal_date: null, probability: 10,
    description: 'Small pilot for a single campus before wider rollout.', internal_notes: '',
    lost_reason: null, won_notes: null, created_by: 'u-priya', created_at: daysAgo(5), last_activity_at: daysAgo(5), next_follow_up: daysFromNow(7), archived: false,
  },
  {
    id: 'l-6', code: 'LD-2026-0006', company_id: 'co-technova',
    lead_type_id: 'lt-new-business', industry: 'Retail', domain: 'Store operations', product_modules: ['Inventory'],
    status: 'Closed Won', priority: 'Medium', owner_id: 'u-priya', source_detail: 'Existing customer — upsell', tags: [],
    plan: 'Pro', seats: 80, billing_cycle: 'Annual', acv: 45000, contract_length: 12, currency: 'USD',
    expected_close_date: daysAgo(10), renewal_date: daysFromNow(355), probability: 100,
    description: 'Add warehouse inventory module to existing footprint.', internal_notes: '',
    lost_reason: null, won_notes: 'Signed at list price, fast 3-week cycle.', created_by: 'u-priya', created_at: daysAgo(60), last_activity_at: daysAgo(10), next_follow_up: null, archived: false,
  },
  {
    id: 'l-7', code: 'LD-2026-0007', company_id: 'co-finedge',
    lead_type_id: 'lt-new-business', industry: 'Finance', domain: 'Payments', product_modules: ['Payments'],
    status: 'Closed Lost', priority: 'Low', owner_id: 'u-arjun', source_detail: 'Outbound prospecting', tags: [],
    plan: 'Pro', seats: 40, billing_cycle: 'Annual', acv: 32000, contract_length: 12, currency: 'USD',
    expected_close_date: daysAgo(15), renewal_date: null, probability: 0,
    description: 'Migration off legacy in-house payments tooling.', internal_notes: '',
    lost_reason: 'Budget', won_notes: null, created_by: 'u-arjun', created_at: daysAgo(80), last_activity_at: daysAgo(15), next_follow_up: null, archived: false,
  },
  {
    id: 'l-8', code: 'LD-2026-0008', company_id: 'co-medicare',
    lead_type_id: 'lt-new-business', industry: 'Healthcare', domain: 'Patient records', product_modules: ['Analytics'],
    status: 'On Hold', priority: 'Medium', owner_id: 'u-arjun', source_detail: 'Existing customer — upsell', tags: [],
    plan: 'Enterprise', seats: 150, billing_cycle: 'Annual', acv: 95000, contract_length: 12, currency: 'USD',
    expected_close_date: daysFromNow(90), renewal_date: null, probability: 30,
    description: 'Paused pending Q3 budget confirmation on their side.', internal_notes: '',
    lost_reason: null, won_notes: null, created_by: 'u-arjun', created_at: daysAgo(40), last_activity_at: daysAgo(20), next_follow_up: daysFromNow(30), archived: false,
  },
]

// --- Projects (instantiate the New Business template) ------------------------

function makeProjectTasksAndItems(projectId, doneCounts) {
  // doneCounts: array of 4 numbers = how many items in each step are marked done, in order
  const tasks = []
  const items = []
  taskSteps.forEach((step, stepIdx) => {
    const taskId = `${projectId}-pt-${stepIdx + 1}`
    const stepItems = checklistTemplateItems.filter((c) => c.task_step_id === step.id)
    const doneN = doneCounts[stepIdx] ?? 0
    let taskStatus = 'Not started'
    if (doneN >= stepItems.length) taskStatus = 'Completed'
    else if (doneN > 0) taskStatus = 'In progress'
    tasks.push({ id: taskId, project_id: projectId, source_task_step_id: step.id, name: step.name, order: step.order, status: taskStatus })
    stepItems.forEach((tmpl, i) => {
      items.push({
        id: `${taskId}-ci-${i + 1}`,
        project_task_id: taskId,
        label: tmpl.label,
        order: tmpl.order,
        state: i < doneN ? 'done' : 'open',
        requires_file: tmpl.requires_file,
        notify: tmpl.notify,
        done_by: i < doneN ? 'u-rohan' : null,
        done_at: i < doneN ? daysAgo(10 - i) : null,
      })
    })
  })
  return { tasks, items }
}

const p1 = makeProjectTasksAndItems('p-1', [3, 1, 0, 0])
const p2 = makeProjectTasksAndItems('p-2', [3, 3, 1, 0])
const p3 = makeProjectTasksAndItems('p-3', [3, 1, 0, 0])
const p4 = makeProjectTasksAndItems('p-4', [3, 3, 3, 1])
const p5 = makeProjectTasksAndItems('p-5', [3, 3, 3, 3])
const p6 = makeProjectTasksAndItems('p-6', [0, 0, 0, 0])

export const projects = [
  { id: 'p-1', lead_id: 'l-1', name: 'Pilot rollout — Store Ops', description: 'Initial pilot across 5 flagship stores.', status: 'In progress', assigned_to: 'u-rohan', start_date: daysAgo(30), target_date: daysFromNow(30), created_by: 'u-priya', created_at: daysAgo(30) },
  { id: 'p-2', lead_id: 'l-2', name: 'Compliance suite rollout', description: 'Full facility rollout of compliance suite.', status: 'In progress', assigned_to: 'u-vikram', start_date: daysAgo(55), target_date: daysFromNow(20), created_by: 'u-arjun', created_at: daysAgo(55) },
  { id: 'p-3', lead_id: 'l-3', name: 'Payments dashboard POC', description: 'Scoped POC for reconciliation team.', status: 'In progress', assigned_to: 'u-sana', start_date: daysAgo(18), target_date: daysFromNow(45), created_by: 'u-priya', created_at: daysAgo(18) },
  { id: 'p-4', lead_id: 'l-4', name: 'Ops portal rollout — 3 hubs', description: 'Expansion rollout to Dallas, Memphis, Atlanta hubs.', status: 'In progress', assigned_to: 'u-rohan', start_date: daysAgo(75), target_date: daysFromNow(10), created_by: 'u-arjun', created_at: daysAgo(75) },
  { id: 'p-5', lead_id: 'l-6', name: 'Warehouse module rollout', description: 'Turn on inventory module for all stores.', status: 'Completed', assigned_to: 'u-sana', start_date: daysAgo(55), target_date: daysAgo(12), created_by: 'u-priya', created_at: daysAgo(55) },
  { id: 'p-6', lead_id: 'l-5', name: 'Pilot — single campus', description: 'Small pilot for one campus before wider rollout.', status: 'Not started', assigned_to: 'u-sana', start_date: null, target_date: daysFromNow(60), created_by: 'u-priya', created_at: daysAgo(5) },
]

export const projectTasks = [...p1.tasks, ...p2.tasks, ...p3.tasks, ...p4.tasks, ...p5.tasks, ...p6.tasks]
export const projectChecklistItems = [...p1.items, ...p2.items, ...p3.items, ...p4.items, ...p5.items, ...p6.items]

export const projectCustomValues = [
  { id: 'pcv-1', project_id: 'p-1', custom_field_id: 'ltcf-1', value: daysFromNow(14) },
  { id: 'pcv-2', project_id: 'p-1', custom_field_id: 'ltcf-2', value: 'false' },
  { id: 'pcv-3', project_id: 'p-2', custom_field_id: 'ltcf-2', value: 'true' },
]

// --- Cross-cutting -------------------------------------------------------------

export const attachments = [
  { id: 'att-1', entity_type: 'checklist_item', entity_id: 'p-1-pt-1-ci-2', filename: 'technova-requirements.pdf', url: '#', uploaded_by: 'u-rohan', uploaded_at: daysAgo(20) },
  { id: 'att-2', entity_type: 'lead', entity_id: 'l-2', filename: 'medicare-rfp.pdf', url: '#', uploaded_by: 'u-arjun', uploaded_at: daysAgo(60) },
  { id: 'att-3', entity_type: 'project', entity_id: 'p-2', filename: 'compliance-suite-scope.docx', url: '#', uploaded_by: 'u-vikram', uploaded_at: daysAgo(40) },
]

export const activities = [
  { id: 'a-1', lead_id: 'l-1', project_id: null, type: 'StatusChange', summary: 'Status changed: Contacted → Qualified', body: '', created_by: 'u-priya', created_at: daysAgo(20) },
  { id: 'a-2', lead_id: 'l-1', project_id: 'p-1', type: 'Assignment', summary: 'Project assigned to Rohan Desai', body: '', created_by: 'u-priya', created_at: daysAgo(30) },
  { id: 'a-3', lead_id: 'l-1', project_id: 'p-1', type: 'ChecklistUpdate', summary: 'Discovery: 3/3 items completed', body: '', created_by: 'u-rohan', created_at: daysAgo(10) },
  { id: 'a-4', lead_id: 'l-1', project_id: null, type: 'Call', summary: 'Discovery call with Laura Kim', body: 'Walked through analytics requirements; needs board-level reporting.', created_by: 'u-priya', created_at: daysAgo(2) },
  { id: 'a-5', lead_id: 'l-2', project_id: null, type: 'Note', summary: 'Legal flagged data residency clause', body: 'Need US-only hosting confirmed in contract.', created_by: 'u-arjun', created_at: daysAgo(5) },
  { id: 'a-6', lead_id: 'l-2', project_id: 'p-2', type: 'ChecklistUpdate', summary: 'Demo / Evaluation: 3/3 items completed', body: '', created_by: 'u-vikram', created_at: daysAgo(15) },
  { id: 'a-7', lead_id: 'l-4', project_id: null, type: 'StatusChange', summary: 'Status changed: Proposal → Negotiation', body: '', created_by: 'u-arjun', created_at: daysAgo(8) },
  { id: 'a-8', lead_id: 'l-6', project_id: null, type: 'StatusChange', summary: 'Status changed: Negotiation → Closed Won', body: '', created_by: 'u-priya', created_at: daysAgo(10) },
  { id: 'a-9', lead_id: 'l-7', project_id: null, type: 'StatusChange', summary: 'Status changed: Negotiation → Closed Lost', body: 'Lost reason: Budget', created_by: 'u-arjun', created_at: daysAgo(15) },
]

export const followups = [
  { id: 'f-1', lead_id: 'l-1', project_id: null, title: 'Send updated pricing sheet to Laura Kim', due_date: daysFromNow(3), assigned_to: 'u-priya', done: false, reminder_at: daysFromNow(2) },
  { id: 'f-2', lead_id: 'l-2', project_id: null, title: 'Follow up on legal redlines', due_date: daysAgo(1), assigned_to: 'u-arjun', done: false, reminder_at: daysAgo(1) },
  { id: 'f-3', lead_id: null, project_id: 'p-1', title: 'Upload signed NDA before kickoff', due_date: daysFromNow(1), assigned_to: 'u-rohan', done: false, reminder_at: daysFromNow(1) },
  { id: 'f-4', lead_id: 'l-4', project_id: null, title: 'Confirm final seat count with Marcus', due_date: daysAgo(2), assigned_to: 'u-arjun', done: false, reminder_at: daysAgo(2) },
  { id: 'f-5', lead_id: null, project_id: 'p-3', title: 'Share POC access credentials', due_date: daysFromNow(5), assigned_to: 'u-sana', done: false, reminder_at: daysFromNow(4) },
  { id: 'f-6', lead_id: 'l-5', project_id: null, title: 'Qualify budget with James Ford', due_date: daysFromNow(7), assigned_to: 'u-priya', done: true, reminder_at: null },
]

export const notifications = [
  { id: 'n-1', user_id: 'u-rohan', type: 'assignment', message: 'You were assigned to project "Pilot rollout — Store Ops"', link: '/projects/p-1', read: true, created_at: daysAgo(30) },
  { id: 'n-2', user_id: 'u-rohan', type: 'checklist', message: '"Confirm decision maker & authority" needs action', link: '/projects/p-1', read: false, created_at: daysAgo(28) },
  { id: 'n-3', user_id: 'u-rohan', type: 'followup', message: 'Follow-up due: Upload signed NDA before kickoff', link: '/followups', read: false, created_at: daysFromNow(1) },
  { id: 'n-4', user_id: 'u-vikram', type: 'assignment', message: 'You were assigned to project "Compliance suite rollout"', link: '/projects/p-2', read: true, created_at: daysAgo(55) },
  { id: 'n-5', user_id: 'u-arjun', type: 'followup', message: 'Follow-up overdue: Follow up on legal redlines', link: '/followups', read: false, created_at: daysAgo(1) },
  { id: 'n-6', user_id: 'u-priya', type: 'lead_assigned', message: 'Lead "LMS pilot" assigned to you', link: '/leads/l-5', read: false, created_at: daysAgo(5) },
  { id: 'n-7', user_id: 'u-sana', type: 'assignment', message: 'You were assigned to project "Payments dashboard POC"', link: '/projects/p-3', read: false, created_at: daysAgo(18) },
]
