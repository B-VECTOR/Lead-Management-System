import { getAll, getById, insert, update, genId, peek } from '../mocks/db'

export async function listCompanies() {
  return getAll('companies')
}

export async function getCompany(id) {
  return getById('companies', id)
}

export async function getCompanyContacts(companyId) {
  const contacts = await getAll('contacts')
  return contacts.filter((c) => c.company_id === companyId)
}

export async function getCompanyLeads(companyId) {
  const leads = await getAll('leads')
  return leads.filter((l) => l.company_id === companyId)
}

export async function createCompany(data, createdBy) {
  const row = {
    id: genId('co'),
    name: data.name,
    industry: data.industry,
    domain: data.domain || '',
    website: data.website || '',
    size: data.size || 'SMB',
    location: data.location || '',
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  return insert('companies', row)
}

export async function updateCompany(id, patch) {
  return update('companies', id, patch)
}

export async function createContact(data) {
  const row = {
    id: genId('ct'),
    company_id: data.company_id,
    name: data.name,
    title: data.title || '',
    email: data.email || '',
    phone: data.phone || '',
    decision_role: data.decision_role || 'User',
    is_primary: !!data.is_primary,
    notes: data.notes || '',
  }
  return insert('contacts', row)
}

export function companyLeadCount(companyId) {
  return peek('leads').filter((l) => l.company_id === companyId).length
}
