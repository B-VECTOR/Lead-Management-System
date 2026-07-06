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

export const ROLES = ['Admin', 'Manager', 'Representative', 'BD Admin']

export const users = [
  { id: 'u-meera', name: 'Meera Shah', email: 'meera.shah@company.com', role: 'Admin', manager_id: null, active: true },
  { id: 'u-rohan', name: 'Rohan Mehta', email: 'rohan.mehta@company.com', role: 'Admin', manager_id: null, active: true },
  { id: 'u-devika', name: 'Devika Rao', email: 'devika.rao@company.com', role: 'BD Admin', manager_id: null, active: true },
  { id: 'u-priya', name: 'Priya Nair', email: 'priya.nair@company.com', role: 'Manager', manager_id: null, active: true },
  { id: 'u-arjun', name: 'Arjun Verma', email: 'arjun.verma@company.com', role: 'Manager', manager_id: null, active: true },
  { id: 'u-satyashri', name: 'Satyashri Mohanti', email: 'satyashri.mohanti@company.com', role: 'Representative', manager_id: 'u-priya', active: true },
  { id: 'u-shailesh', name: 'Shailesh Ranjan', email: 'shailesh.ranjan@company.com', role: 'Representative', manager_id: 'u-arjun', active: true },
]

export const companies = [
  { id: 'co-technova', name: 'TechNova Retail', industry: 'Organised Retail', domain: 'Operations', website: 'https://technova.example.com', size: 'Enterprise', location: 'Chicago, IL', created_by: 'u-priya', created_at: daysAgo(220) },
  { id: 'co-medicare', name: 'MediCare Systems', industry: 'Pharma & Chemical', domain: 'Projects', website: 'https://medicaresystems.example.com', size: 'Enterprise', location: 'Boston, MA', created_by: 'u-arjun', created_at: daysAgo(180) },
  { id: 'co-finedge', name: 'FinEdge Capital', industry: 'Banking', domain: 'Distribution', website: 'https://finedge.example.com', size: 'Mid', location: 'New York, NY', created_by: 'u-priya', created_at: daysAgo(140) },
  { id: 'co-logitrack', name: 'LogiTrack Freight', industry: 'Industrial Goods', domain: 'Operations', website: 'https://logitrack.example.com', size: 'Enterprise', location: 'Dallas, TX', created_by: 'u-arjun', created_at: daysAgo(160) },
  { id: 'co-bright', name: 'Bright Learning Co', industry: 'Information Technology', domain: 'NPD', website: 'https://brightlearning.example.com', size: 'SMB', location: 'Austin, TX', created_by: 'u-priya', created_at: daysAgo(30) },
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
// Real workflows for all 3 lead types: BD, Mining, Extension.

export const leadTypeCustomFields = [
  { id: 'ltcf-1', lead_type_id: 'lt-bd', field_name: 'POC start date', field_type: 'date', required: false, options: [] },
  { id: 'ltcf-2', lead_type_id: 'lt-bd', field_name: 'Compliance review needed?', field_type: 'boolean', required: false, options: [] },
]

export const leadTypes = [
  { id: 'lt-bd', name: 'BD', description: 'Business development — net-new engagement, full cycle from discovery to signed contract.', active: true },
  { id: 'lt-mining', name: 'Mining', description: 'Mining an existing account for expansion opportunities.', active: true },
  { id: 'lt-extension', name: 'Extension', description: 'Extending or renewing an existing engagement.', active: true },
]

export const taskSteps = [
  { id: 'ts-bd-1', lead_type_id: 'lt-bd', name: 'Introduction', order: 1, description: '' },
  { id: 'ts-bd-2', lead_type_id: 'lt-bd', name: '2Hr Study & Presentation', order: 2, description: '' },
  { id: 'ts-bd-3', lead_type_id: 'lt-bd', name: 'Solution Blueprint', order: 3, description: '' },
  { id: 'ts-bd-4', lead_type_id: 'lt-bd', name: 'Implementation', order: 4, description: '' },

  { id: 'ts-mining-1', lead_type_id: 'lt-mining', name: 'Exploration', order: 1, description: '' },
  { id: 'ts-mining-2', lead_type_id: 'lt-mining', name: '2Hr Study & Presentation', order: 2, description: '' },
  { id: 'ts-mining-3', lead_type_id: 'lt-mining', name: 'Solution Blueprint', order: 3, description: '' },
  { id: 'ts-mining-4', lead_type_id: 'lt-mining', name: 'Implementation', order: 4, description: '' },

  { id: 'ts-ext-1', lead_type_id: 'lt-extension', name: 'Extension Discussion', order: 1, description: '' },
  { id: 'ts-ext-2', lead_type_id: 'lt-extension', name: 'Extension - Implementation', order: 2, description: '' },
]

export const checklistTemplateItems = [
  // BD — Introduction
  { id: 'cti-bd-1-1', task_step_id: 'ts-bd-1', label: "1.1 - Vector's Intro Email", order: 1, requires_file: false },
  { id: 'cti-bd-1-2', task_step_id: 'ts-bd-1', label: '1.2 - Intro presentation to decision maker', order: 2, requires_file: false },
  { id: 'cti-bd-1-3', task_step_id: 'ts-bd-1', label: '1.3 - Area of work, objective agreed', order: 3, requires_file: false },
  { id: 'cti-bd-1-4', task_step_id: 'ts-bd-1', label: '1.4 - Email sent to initiate study', order: 4, requires_file: false },

  // BD — 2Hr Study & Presentation
  { id: 'cti-bd-2-1', task_step_id: 'ts-bd-2', label: '2.1 - Team Assignment', order: 1, requires_file: false },
  { id: 'cti-bd-2-2', task_step_id: 'ts-bd-2', label: '2.2 - Study Planning', order: 2, requires_file: false },
  { id: 'cti-bd-2-3', task_step_id: 'ts-bd-2', label: '2.3 - NDA Formality', order: 3, requires_file: false },
  { id: 'cti-bd-2-4', task_step_id: 'ts-bd-2', label: '2.4 - Study Interactions', order: 4, requires_file: false },
  { id: 'cti-bd-2-5', task_step_id: 'ts-bd-2', label: '2.5 - Data Receipt', order: 5, requires_file: false },
  { id: 'cti-bd-2-6', task_step_id: 'ts-bd-2', label: '2.6 - 2Hr Presentation', order: 6, requires_file: false },
  { id: 'cti-bd-2-7', task_step_id: 'ts-bd-2', label: '2.7 - Proposal request', order: 7, requires_file: false },
  { id: 'cti-bd-2-8', task_step_id: 'ts-bd-2', label: '2.8 - Reimbursement Expenses Invoiced', order: 8, requires_file: false },
  { id: 'cti-bd-2-9', task_step_id: 'ts-bd-2', label: '2.9 - Reimbursement Expenses Received', order: 9, requires_file: false },

  // BD — Solution Blueprint
  { id: 'cti-bd-3-1', task_step_id: 'ts-bd-3', label: '3.1 - Proposal Submission', order: 1, requires_file: false },
  { id: 'cti-bd-3-2', task_step_id: 'ts-bd-3', label: '3.2 - Negotiation', order: 2, requires_file: false },
  { id: 'cti-bd-3-3', task_step_id: 'ts-bd-3', label: '3.3 - Team Assignment', order: 3, requires_file: false },
  { id: 'cti-bd-3-4', task_step_id: 'ts-bd-3', label: '3.4 - Engagement Start', order: 4, requires_file: false },
  { id: 'cti-bd-3-5', task_step_id: 'ts-bd-3', label: '3.5 - Initial Invoice', order: 5, requires_file: false },
  { id: 'cti-bd-3-6', task_step_id: 'ts-bd-3', label: '3.6 - Presentation Dates', order: 6, requires_file: false },
  { id: 'cti-bd-3-7', task_step_id: 'ts-bd-3', label: '3.7 - SnT Workshop', order: 7, requires_file: false },
  { id: 'cti-bd-3-8', task_step_id: 'ts-bd-3', label: '3.8 - Completion Invoice', order: 8, requires_file: false },
  { id: 'cti-bd-3-9', task_step_id: 'ts-bd-3', label: '3.9 - Reimbursement Invoice', order: 9, requires_file: false },
  { id: 'cti-bd-3-10', task_step_id: 'ts-bd-3', label: '4.0 - Proposal Request', order: 10, requires_file: false },

  // BD — Implementation
  { id: 'cti-bd-4-1', task_step_id: 'ts-bd-4', label: '4.1 - Proposal Submission', order: 1, requires_file: false },
  { id: 'cti-bd-4-2', task_step_id: 'ts-bd-4', label: '4.2 - Negotiation', order: 2, requires_file: false },
  { id: 'cti-bd-4-3', task_step_id: 'ts-bd-4', label: '4.3 - Team Assignment', order: 3, requires_file: false },
  { id: 'cti-bd-4-4', task_step_id: 'ts-bd-4', label: '4.4 - Engagement Start', order: 4, requires_file: false },
  { id: 'cti-bd-4-5', task_step_id: 'ts-bd-4', label: '4.5 - Agreement / Contract', order: 5, requires_file: false },
  { id: 'cti-bd-4-6', task_step_id: 'ts-bd-4', label: '4.6 - Variable Parameter Finalisation', order: 6, requires_file: false },
  { id: 'cti-bd-4-7', task_step_id: 'ts-bd-4', label: '4.7 - Variable Baseline Sign-off', order: 7, requires_file: false },
  { id: 'cti-bd-4-8', task_step_id: 'ts-bd-4', label: '4.8 - Addendum Agreement', order: 8, requires_file: false },
  { id: 'cti-bd-4-9', task_step_id: 'ts-bd-4', label: '4.9 - PO', order: 9, requires_file: false },

  // Mining — Exploration
  { id: 'cti-mining-1-0', task_step_id: 'ts-mining-1', label: '1.0 - Area Identification', order: 1, requires_file: false },
  { id: 'cti-mining-1-1', task_step_id: 'ts-mining-1', label: '1.1 - Background Preparation', order: 2, requires_file: false },
  { id: 'cti-mining-1-2', task_step_id: 'ts-mining-1', label: '1.2 - Intro presentation to decision maker', order: 3, requires_file: false },
  { id: 'cti-mining-1-3', task_step_id: 'ts-mining-1', label: '1.3 - Area of work, objective agreed', order: 4, requires_file: false },
  { id: 'cti-mining-1-4', task_step_id: 'ts-mining-1', label: '1.4 - Email sent to initiate study', order: 5, requires_file: false },

  // Mining — 2Hr Study & Presentation (same as BD)
  { id: 'cti-mining-2-1', task_step_id: 'ts-mining-2', label: '2.1 - Team Assignment', order: 1, requires_file: false },
  { id: 'cti-mining-2-2', task_step_id: 'ts-mining-2', label: '2.2 - Study Planning', order: 2, requires_file: false },
  { id: 'cti-mining-2-3', task_step_id: 'ts-mining-2', label: '2.3 - NDA Formality', order: 3, requires_file: false },
  { id: 'cti-mining-2-4', task_step_id: 'ts-mining-2', label: '2.4 - Study Interactions', order: 4, requires_file: false },
  { id: 'cti-mining-2-5', task_step_id: 'ts-mining-2', label: '2.5 - Data Receipt', order: 5, requires_file: false },
  { id: 'cti-mining-2-6', task_step_id: 'ts-mining-2', label: '2.6 - 2Hr Presentation', order: 6, requires_file: false },
  { id: 'cti-mining-2-7', task_step_id: 'ts-mining-2', label: '2.7 - Proposal request', order: 7, requires_file: false },
  { id: 'cti-mining-2-8', task_step_id: 'ts-mining-2', label: '2.8 - Reimbursement Expenses Invoiced', order: 8, requires_file: false },
  { id: 'cti-mining-2-9', task_step_id: 'ts-mining-2', label: '2.9 - Reimbursement Expenses Received', order: 9, requires_file: false },

  // Mining — Solution Blueprint (same as BD)
  { id: 'cti-mining-3-1', task_step_id: 'ts-mining-3', label: '3.1 - Proposal Submission', order: 1, requires_file: false },
  { id: 'cti-mining-3-2', task_step_id: 'ts-mining-3', label: '3.2 - Negotiation', order: 2, requires_file: false },
  { id: 'cti-mining-3-3', task_step_id: 'ts-mining-3', label: '3.3 - Team Assignment', order: 3, requires_file: false },
  { id: 'cti-mining-3-4', task_step_id: 'ts-mining-3', label: '3.4 - Engagement Start', order: 4, requires_file: false },
  { id: 'cti-mining-3-5', task_step_id: 'ts-mining-3', label: '3.5 - Initial Invoice', order: 5, requires_file: false },
  { id: 'cti-mining-3-6', task_step_id: 'ts-mining-3', label: '3.6 - Presentation Dates', order: 6, requires_file: false },
  { id: 'cti-mining-3-7', task_step_id: 'ts-mining-3', label: '3.7 - SnT Workshop', order: 7, requires_file: false },
  { id: 'cti-mining-3-8', task_step_id: 'ts-mining-3', label: '3.8 - Completion Invoice', order: 8, requires_file: false },
  { id: 'cti-mining-3-9', task_step_id: 'ts-mining-3', label: '3.9 - Reimbursement Invoice', order: 9, requires_file: false },
  { id: 'cti-mining-3-10', task_step_id: 'ts-mining-3', label: '4.0 - Proposal Request', order: 10, requires_file: false },

  // Mining — Implementation (same as BD)
  { id: 'cti-mining-4-1', task_step_id: 'ts-mining-4', label: '4.1 - Proposal Submission', order: 1, requires_file: false },
  { id: 'cti-mining-4-2', task_step_id: 'ts-mining-4', label: '4.2 - Negotiation', order: 2, requires_file: false },
  { id: 'cti-mining-4-3', task_step_id: 'ts-mining-4', label: '4.3 - Team Assignment', order: 3, requires_file: false },
  { id: 'cti-mining-4-4', task_step_id: 'ts-mining-4', label: '4.4 - Engagement Start', order: 4, requires_file: false },
  { id: 'cti-mining-4-5', task_step_id: 'ts-mining-4', label: '4.5 - Agreement / Contract', order: 5, requires_file: false },
  { id: 'cti-mining-4-6', task_step_id: 'ts-mining-4', label: '4.6 - Variable Parameter Finalisation', order: 6, requires_file: false },
  { id: 'cti-mining-4-7', task_step_id: 'ts-mining-4', label: '4.7 - Variable Baseline Sign-off', order: 7, requires_file: false },
  { id: 'cti-mining-4-8', task_step_id: 'ts-mining-4', label: '4.8 - Addendum Agreement', order: 8, requires_file: false },
  { id: 'cti-mining-4-9', task_step_id: 'ts-mining-4', label: '4.9 - PO', order: 9, requires_file: false },

  // Extension — Extension Discussion
  { id: 'cti-ext-1-1', task_step_id: 'ts-ext-1', label: '1.1 - Scope document', order: 1, requires_file: false },
  { id: 'cti-ext-1-2', task_step_id: 'ts-ext-1', label: '1.2 - Scope agreement', order: 2, requires_file: false },
  { id: 'cti-ext-1-3', task_step_id: 'ts-ext-1', label: '1.3 - Proposal Submission', order: 3, requires_file: false },
  { id: 'cti-ext-1-4', task_step_id: 'ts-ext-1', label: '1.4 - Negotiation', order: 4, requires_file: false },
  { id: 'cti-ext-1-5', task_step_id: 'ts-ext-1', label: '1.5 - Addendum Agreement', order: 5, requires_file: false },

  // Extension — Extension - Implementation: no checklist items, data-entry fields only.
]

// Fixed additional input fields per step (§7.1 Task tab) — not a checklist;
// always the same shape for a given step, just data entry (e.g. fee amounts,
// dates). Admin-configured in the template, same pattern as checklist items.
// field_type drives the input control rendered in TaskStepFields.
export const taskStepFields = [
  // BD
  { id: 'tsf-bd-1-1', task_step_id: 'ts-bd-1', field_name: 'Expected start date of next stage', field_type: 'date', order: 1 },

  { id: 'tsf-bd-2-1', task_step_id: 'ts-bd-2', field_name: 'Fee for engagement', field_type: 'number', order: 1 },
  { id: 'tsf-bd-2-2', task_step_id: 'ts-bd-2', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 2 },
  { id: 'tsf-bd-2-3', task_step_id: 'ts-bd-2', field_name: 'Expected start date of next stage', field_type: 'date', order: 3 },

  { id: 'tsf-bd-3-1', task_step_id: 'ts-bd-3', field_name: 'Engagement Start Date', field_type: 'date', order: 1 },
  { id: 'tsf-bd-3-2', task_step_id: 'ts-bd-3', field_name: 'SnT Workshop Date', field_type: 'text', order: 2 },
  { id: 'tsf-bd-3-3', task_step_id: 'ts-bd-3', field_name: 'Fee for engagement', field_type: 'number', order: 3 },
  { id: 'tsf-bd-3-4', task_step_id: 'ts-bd-3', field_name: 'Period in weeks', field_type: 'number', order: 4 },
  { id: 'tsf-bd-3-5', task_step_id: 'ts-bd-3', field_name: 'Additional Fees for delay', field_type: 'number', order: 5 },
  { id: 'tsf-bd-3-6', task_step_id: 'ts-bd-3', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 6 },
  { id: 'tsf-bd-3-7', task_step_id: 'ts-bd-3', field_name: 'Expected start date of next stage', field_type: 'date', order: 7 },

  { id: 'tsf-bd-4-1', task_step_id: 'ts-bd-4', field_name: 'Engagement Start Date', field_type: 'date', order: 1 },
  { id: 'tsf-bd-4-2', task_step_id: 'ts-bd-4', field_name: 'Engagement End Date', field_type: 'date', order: 2 },
  { id: 'tsf-bd-4-3', task_step_id: 'ts-bd-4', field_name: 'Period Months', field_type: 'number', order: 3 },
  { id: 'tsf-bd-4-4', task_step_id: 'ts-bd-4', field_name: 'Variable Fee Start Date', field_type: 'date', order: 4 },
  { id: 'tsf-bd-4-5', task_step_id: 'ts-bd-4', field_name: 'Variable Fee End Date', field_type: 'date', order: 5 },
  { id: 'tsf-bd-4-6', task_step_id: 'ts-bd-4', field_name: 'Fixed Fee', field_type: 'number', order: 6 },
  { id: 'tsf-bd-4-7', task_step_id: 'ts-bd-4', field_name: 'Fixed fee start date', field_type: 'date', order: 7 },
  { id: 'tsf-bd-4-8', task_step_id: 'ts-bd-4', field_name: 'Variable Fee (Cap)', field_type: 'number', order: 8 },
  { id: 'tsf-bd-4-9', task_step_id: 'ts-bd-4', field_name: 'Milestone Fee', field_type: 'number', order: 9 },
  { id: 'tsf-bd-4-10', task_step_id: 'ts-bd-4', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 10 },

  // Mining (same shape as BD steps 2-4)
  { id: 'tsf-mining-1-1', task_step_id: 'ts-mining-1', field_name: 'Expected start date of next stage', field_type: 'date', order: 1 },

  { id: 'tsf-mining-2-1', task_step_id: 'ts-mining-2', field_name: 'Fee for engagement', field_type: 'number', order: 1 },
  { id: 'tsf-mining-2-2', task_step_id: 'ts-mining-2', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 2 },
  { id: 'tsf-mining-2-3', task_step_id: 'ts-mining-2', field_name: 'Expected start date of next stage', field_type: 'date', order: 3 },

  { id: 'tsf-mining-3-1', task_step_id: 'ts-mining-3', field_name: 'Engagement Start Date', field_type: 'date', order: 1 },
  { id: 'tsf-mining-3-2', task_step_id: 'ts-mining-3', field_name: 'SnT Workshop Date', field_type: 'text', order: 2 },
  { id: 'tsf-mining-3-3', task_step_id: 'ts-mining-3', field_name: 'Fee for engagement', field_type: 'number', order: 3 },
  { id: 'tsf-mining-3-4', task_step_id: 'ts-mining-3', field_name: 'Period in weeks', field_type: 'number', order: 4 },
  { id: 'tsf-mining-3-5', task_step_id: 'ts-mining-3', field_name: 'Additional Fees for delay', field_type: 'number', order: 5 },
  { id: 'tsf-mining-3-6', task_step_id: 'ts-mining-3', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 6 },
  { id: 'tsf-mining-3-7', task_step_id: 'ts-mining-3', field_name: 'Expected start date of next stage', field_type: 'date', order: 7 },

  { id: 'tsf-mining-4-1', task_step_id: 'ts-mining-4', field_name: 'Engagement Start Date', field_type: 'date', order: 1 },
  { id: 'tsf-mining-4-2', task_step_id: 'ts-mining-4', field_name: 'Engagement End Date', field_type: 'date', order: 2 },
  { id: 'tsf-mining-4-3', task_step_id: 'ts-mining-4', field_name: 'Period Months', field_type: 'number', order: 3 },
  { id: 'tsf-mining-4-4', task_step_id: 'ts-mining-4', field_name: 'Variable Fee Start Date', field_type: 'date', order: 4 },
  { id: 'tsf-mining-4-5', task_step_id: 'ts-mining-4', field_name: 'Variable Fee End Date', field_type: 'date', order: 5 },
  { id: 'tsf-mining-4-6', task_step_id: 'ts-mining-4', field_name: 'Fixed Fee', field_type: 'number', order: 6 },
  { id: 'tsf-mining-4-7', task_step_id: 'ts-mining-4', field_name: 'Fixed fee start date', field_type: 'date', order: 7 },
  { id: 'tsf-mining-4-8', task_step_id: 'ts-mining-4', field_name: 'Variable Fee (Cap)', field_type: 'number', order: 8 },
  { id: 'tsf-mining-4-9', task_step_id: 'ts-mining-4', field_name: 'Milestone Fee', field_type: 'number', order: 9 },
  { id: 'tsf-mining-4-10', task_step_id: 'ts-mining-4', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 10 },

  // Extension
  { id: 'tsf-ext-1-1', task_step_id: 'ts-ext-1', field_name: 'Extension granted?', field_type: 'boolean', order: 1 },
  { id: 'tsf-ext-1-2', task_step_id: 'ts-ext-1', field_name: 'Expected start date of next stage', field_type: 'date', order: 2 },

  { id: 'tsf-ext-2-1', task_step_id: 'ts-ext-2', field_name: 'Engagement Start Date', field_type: 'date', order: 1 },
  { id: 'tsf-ext-2-2', task_step_id: 'ts-ext-2', field_name: 'Engagement End Date', field_type: 'date', order: 2 },
  { id: 'tsf-ext-2-3', task_step_id: 'ts-ext-2', field_name: 'Period Months', field_type: 'number', order: 3 },
  { id: 'tsf-ext-2-4', task_step_id: 'ts-ext-2', field_name: 'Variable Fee Start Date', field_type: 'date', order: 4 },
  { id: 'tsf-ext-2-5', task_step_id: 'ts-ext-2', field_name: 'Variable Fee End Date', field_type: 'date', order: 5 },
  { id: 'tsf-ext-2-6', task_step_id: 'ts-ext-2', field_name: 'Fixed Fee', field_type: 'number', order: 6 },
  { id: 'tsf-ext-2-7', task_step_id: 'ts-ext-2', field_name: 'Fixed fee start date', field_type: 'date', order: 7 },
  { id: 'tsf-ext-2-8', task_step_id: 'ts-ext-2', field_name: 'Variable Fee (Cap)', field_type: 'number', order: 8 },
  { id: 'tsf-ext-2-9', task_step_id: 'ts-ext-2', field_name: 'Milestone Fee', field_type: 'number', order: 9 },
  { id: 'tsf-ext-2-10', task_step_id: 'ts-ext-2', field_name: 'ManPower (Project Manager + Additional resources)', field_type: 'text', order: 10 },
]

export const INDUSTRIES = [
  'Auto Comp', 'Auto OEM', 'Banking', 'Building & Construction Goods', 'CapEx', 'Consumer Goods',
  'EPC', 'ETO', 'FMCG', 'FMEG', 'Industrial Goods', 'Information Technology',
  'Machinery & Equipment', 'Organised Retail', 'Pharma & Chemical', 'Textile & Fashion',
]
export const DOMAINS = [
  'B2B Sales', 'B2C Sales', 'Distribution', 'NPD', 'Operations', 'Projects', 'Supply Chain',
  'VectorFLOW AMC', 'VectorFLOW Upgrade', 'VectorPRO AMC', 'VectorPRO Upgrade',
]
export const DIVISIONS = ['Aftermarket', 'Spares', 'Fan Division']

export const LEAD_STATUSES = ['In Progress', 'On Hold', 'Dropped', 'Completed']
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

// Checklist item status (Task tab) — separate scale from the lead's own status (§8).
export const CHECKLIST_ITEM_STATUSES = [
  { value: 'open', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Completed' },
  { value: 'na', label: 'N/A' },
]

// --- Leads (merged lead + execution fields) -----------------------------------
// 3 demo leads, each showing a different point in the ownership flow (§21.21 +
// hierarchy rework): Admin creates → delegates ownership to a Manager → Manager
// assigns a Representative (or keeps it and works it directly).

export const leads = [
  {
    // Admin Meera creates it, delegates ownership to Manager Priya, who assigns rep Satyashri.
    id: 'l-1', code: 'LD-2026-0001', name: 'Store Analytics Rollout', company_id: 'co-technova',
    lead_type_id: 'lt-bd', industry: 'Organised Retail', domain: 'Operations', division: 'Aftermarket',
    scope: 'Analytics and reporting rollout across all 120 store locations.',
    status: 'In Progress', priority: 'Medium', owner_id: 'u-priya', source_detail: 'Inbound — website demo request', tags: ['expansion-potential'],
    description: 'Rolling out real-time store analytics across 120 locations.', internal_notes: 'Champion is Laura Kim; IT sign-off pending.',
    assigned_to: 'u-satyashri', start_date: daysAgo(30), target_date: daysFromNow(30),
    created_by: 'u-meera', created_at: daysAgo(30), last_activity_at: daysAgo(2), next_follow_up: daysFromNow(3), archived: false,
  },
  {
    // Admin Rohan creates it, delegates ownership to Manager Arjun, who assigns rep Shailesh.
    id: 'l-2', code: 'LD-2026-0002', name: 'HIPAA Compliance Suite', company_id: 'co-medicare',
    lead_type_id: 'lt-bd', industry: 'Pharma & Chemical', domain: 'Projects', division: 'Spares',
    scope: 'Compliance and reporting modules for HIPAA audit readiness across all facilities.',
    status: 'In Progress', priority: 'High', owner_id: 'u-arjun', source_detail: 'Referral by existing customer', tags: ['hipaa', 'strategic'],
    description: 'Compliance suite for HIPAA audit readiness across all facilities.', internal_notes: 'Legal review requested on our side too.',
    assigned_to: 'u-shailesh', start_date: daysAgo(55), target_date: daysFromNow(20),
    created_by: 'u-rohan', created_at: daysAgo(55), last_activity_at: daysAgo(1), next_follow_up: daysFromNow(2), archived: false,
  },
  {
    // Manager Priya creates and owns it herself — no Admin involved, rep not
    // assigned yet (the "manager can assign his own [rep], later" path).
    id: 'l-3', code: 'LD-2026-0003', name: 'Reconciliation Dashboard Mining', company_id: 'co-finedge',
    lead_type_id: 'lt-mining', industry: 'Banking', domain: 'Distribution', division: 'Fan Division',
    scope: 'Payments reconciliation dashboard and analytics for a second module.',
    status: 'In Progress', priority: 'Low', owner_id: 'u-priya', source_detail: 'Outbound prospecting', tags: [],
    description: 'Mining FinEdge for a second module — reconciliation dashboard.', internal_notes: '',
    assigned_to: null, start_date: daysAgo(18), target_date: daysFromNow(45),
    created_by: 'u-priya', created_at: daysAgo(18), last_activity_at: daysAgo(4), next_follow_up: daysFromNow(5), archived: false,
  },
]

// --- Task/checklist working instances (one set per lead) ---------------------

// A step's "Additional details" fields now count toward step completion
// (§8.3 rework) alongside its checklist items. Steps whose demo doneCounts
// already made them look finished get a placeholder value per field so
// they don't regress to "In progress" purely for lacking seed data.
function placeholderFieldValue(fieldType) {
  if (fieldType === 'date') return daysFromNow(30)
  if (fieldType === 'number') return '10000'
  if (fieldType === 'boolean') return 'Yes'
  return 'TBD'
}

function makeLeadTasksAndItems(leadId, leadTypeId, doneCounts, completedBy) {
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
        notes: '',
        done_by: i < doneN ? completedBy : null,
        done_at: i < doneN ? daysAgo(10 - i) : null,
      })
    })
    const stepFields = taskStepFields.filter((f) => f.task_step_id === step.id).sort((a, b) => a.order - b.order)
    const stepLooksComplete = doneN >= stepItems.length
    stepFields.forEach((tmpl) => {
      const value = stepLooksComplete ? placeholderFieldValue(tmpl.field_type) : ''
      fields.push({ id: `${taskId}-f-${tmpl.order}`, lead_task_id: taskId, field_name: tmpl.field_name, field_type: tmpl.field_type || 'text', field_value: value, order: tmpl.order })
    })
  })
  return { tasks, items, fields }
}

// l-1: Introduction done, 2Hr Study in progress. l-2: further along — Introduction
// and 2Hr Study done, Solution Blueprint in progress. l-3: unassigned, so the
// owner (Priya) is the one shown completing work so far.
const t1 = makeLeadTasksAndItems('l-1', 'lt-bd', [4, 3, 0, 0], 'u-satyashri')
const t2 = makeLeadTasksAndItems('l-2', 'lt-bd', [4, 9, 4, 0], 'u-shailesh')
const t3 = makeLeadTasksAndItems('l-3', 'lt-mining', [5, 2, 0, 0], 'u-priya')

export const leadTasks = [...t1.tasks, ...t2.tasks, ...t3.tasks]
export const leadChecklistItems = [...t1.items, ...t2.items, ...t3.items]
export const leadTaskFields = [...t1.fields, ...t2.fields, ...t3.fields]

// Seed one example remark to showcase the feature with real data.
const l1FirstChecklistItem = leadChecklistItems.find((i) => i.id === 'l-1-t-1-ci-1')
if (l1FirstChecklistItem) l1FirstChecklistItem.notes = 'Confirmed with Laura Kim — she has budget authority.'

// Fill in a couple of example values on l-1's already-completed steps so the
// "Additional details" feature shows real data out of the box.
const l1IntroField = leadTaskFields.find((f) => f.lead_task_id === 'l-1-t-1')
if (l1IntroField) l1IntroField.field_value = daysFromNow(14)
const l1StudyFields = leadTaskFields.filter((f) => f.lead_task_id === 'l-1-t-2')
if (l1StudyFields[0]) l1StudyFields[0].field_value = '150000'
if (l1StudyFields[1]) l1StudyFields[1].field_value = '2'

export const leadCustomValues = [
  { id: 'lcv-1', lead_id: 'l-1', custom_field_id: 'ltcf-1', value: daysFromNow(14) },
  { id: 'lcv-2', lead_id: 'l-1', custom_field_id: 'ltcf-2', value: 'false' },
  { id: 'lcv-3', lead_id: 'l-2', custom_field_id: 'ltcf-2', value: 'true' },
]

// --- Cross-cutting -------------------------------------------------------------

export const attachments = [
  { id: 'att-1', entity_type: 'checklist_item', entity_id: 'l-1-t-1-ci-2', filename: 'technova-requirements.pdf', title: null, url: demoFileUrl('Demo placeholder for technova-requirements.pdf'), uploaded_by: 'u-satyashri', uploaded_at: daysAgo(20) },
  { id: 'att-2', entity_type: 'lead', entity_id: 'l-2', filename: 'medicare-rfp.pdf', title: 'MediCare RFP (original)', url: demoFileUrl('Demo placeholder for medicare-rfp.pdf'), uploaded_by: 'u-arjun', uploaded_at: daysAgo(60) },
  { id: 'att-3', entity_type: 'lead', entity_id: 'l-2', filename: 'compliance-suite-scope.docx', title: 'Compliance suite — scope doc', url: demoFileUrl('Demo placeholder for compliance-suite-scope.docx'), uploaded_by: 'u-shailesh', uploaded_at: daysAgo(40) },
]

export const activities = [
  { id: 'a-1', lead_id: 'l-1', type: 'Note', summary: 'Lead created by Meera Shah; Priya Nair assigned as owner', body: '', created_by: 'u-meera', created_at: daysAgo(30) },
  { id: 'a-2', lead_id: 'l-1', type: 'Assignment', summary: 'Assigned to Satyashri Mohanti', body: '', created_by: 'u-priya', created_at: daysAgo(29) },
  { id: 'a-3', lead_id: 'l-1', type: 'ChecklistUpdate', summary: 'Introduction: 4/4 items completed', body: '', created_by: 'u-satyashri', created_at: daysAgo(10) },
  { id: 'a-4', lead_id: 'l-1', type: 'Call', summary: 'Discovery call with Laura Kim', body: 'Walked through analytics requirements; needs board-level reporting.', created_by: 'u-priya', created_at: daysAgo(2) },
  { id: 'a-5', lead_id: 'l-2', type: 'Note', summary: 'Lead created by Rohan Mehta; Arjun Verma assigned as owner', body: '', created_by: 'u-rohan', created_at: daysAgo(55) },
  { id: 'a-6', lead_id: 'l-2', type: 'Assignment', summary: 'Assigned to Shailesh Ranjan', body: '', created_by: 'u-arjun', created_at: daysAgo(54) },
  { id: 'a-7', lead_id: 'l-2', type: 'Note', summary: 'Legal flagged data residency clause', body: 'Need US-only hosting confirmed in contract.', created_by: 'u-arjun', created_at: daysAgo(5) },
  { id: 'a-8', lead_id: 'l-2', type: 'ChecklistUpdate', summary: '2Hr Study & Presentation: 9/9 items completed', body: '', created_by: 'u-shailesh', created_at: daysAgo(15) },
  { id: 'a-9', lead_id: 'l-3', type: 'Note', summary: 'Lead created by Priya Nair (self-owned, no rep assigned yet)', body: '', created_by: 'u-priya', created_at: daysAgo(18) },
  { id: 'a-10', lead_id: 'l-3', type: 'ChecklistUpdate', summary: 'Exploration: 5/5 items completed', body: '', created_by: 'u-priya', created_at: daysAgo(8) },
]

export const followups = [
  { id: 'f-1', lead_id: 'l-1', title: 'Send updated pricing sheet to Laura Kim', due_date: daysFromNow(3), assigned_to: 'u-priya', done: false, reminder_at: daysFromNow(2) },
  { id: 'f-2', lead_id: 'l-1', title: 'Upload signed NDA before kickoff', due_date: daysFromNow(1), assigned_to: 'u-satyashri', done: false, reminder_at: daysFromNow(1) },
  { id: 'f-3', lead_id: 'l-2', title: 'Follow up on legal redlines', due_date: daysAgo(1), assigned_to: 'u-arjun', done: false, reminder_at: daysAgo(1) },
  { id: 'f-4', lead_id: 'l-3', title: 'Share POC access credentials', due_date: daysFromNow(5), assigned_to: 'u-priya', done: false, reminder_at: daysFromNow(4) },
]

// Comment-thread history on a follow-up (§ Follow ups "Update status" dialog).
export const followupUpdates = [
  { id: 'fu-1', followup_id: 'f-1', author_id: 'u-priya', comment: 'Draft pricing sheet ready, waiting on final discount approval.', created_at: daysAgo(1) },
  { id: 'fu-2', followup_id: 'f-3', author_id: 'u-arjun', comment: 'Sent a reminder to legal; waiting on their redline turnaround.', created_at: daysAgo(0) },
]

export const notifications = [
  { id: 'n-1', user_id: 'u-priya', type: 'lead_assigned', message: 'Lead LD-2026-0001 (TechNova Retail) assigned to you', link: '/leads/l-1', read: true, created_at: daysAgo(30) },
  { id: 'n-2', user_id: 'u-satyashri', type: 'assignment', message: 'You were assigned to lead LD-2026-0001 (TechNova Retail)', link: '/leads/l-1', read: true, created_at: daysAgo(29) },
  { id: 'n-3', user_id: 'u-satyashri', type: 'checklist', message: '"1.1 - Vector\'s Intro Email" needs action', link: '/leads/l-1', read: false, created_at: daysAgo(28) },
  { id: 'n-4', user_id: 'u-satyashri', type: 'followup', message: 'Follow-up due: Upload signed NDA before kickoff', link: '/leads/l-1', read: false, created_at: daysFromNow(1) },
  { id: 'n-5', user_id: 'u-arjun', type: 'lead_assigned', message: 'Lead LD-2026-0002 (MediCare Systems) assigned to you', link: '/leads/l-2', read: true, created_at: daysAgo(55) },
  { id: 'n-6', user_id: 'u-shailesh', type: 'assignment', message: 'You were assigned to lead LD-2026-0002 (MediCare Systems)', link: '/leads/l-2', read: true, created_at: daysAgo(54) },
  { id: 'n-7', user_id: 'u-arjun', type: 'followup', message: 'Follow-up overdue: Follow up on legal redlines', link: '/leads/l-2', read: false, created_at: daysAgo(1) },
  { id: 'n-8', user_id: 'u-priya', type: 'followup', message: 'Follow-up due: Share POC access credentials', link: '/leads/l-3', read: false, created_at: daysFromNow(4) },
]
