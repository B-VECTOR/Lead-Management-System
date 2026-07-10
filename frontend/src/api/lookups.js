// Reference-data lookups backed by the real Django API (specs.md §17) — the
// set of assignable roles (Groups) and belts now lives in the database, not
// hardcoded frontend arrays.
import client from './client'

export async function getGroups() {
  const { data } = await client.get('/api/groups/')
  return data
}

export async function getBelts() {
  const { data } = await client.get('/api/belts/')
  return data
}

// Areas (labeled "Domain" on the user and lead forms) — the shared reference
// table (Tech Req §4.1/§4.2), replacing the old hardcoded DOMAINS array.
export async function getAreas() {
  const { data } = await client.get('/api/areas/')
  return data
}

// Countries + industries back the lead form's Country / Industry selects
// (Tech Req §4.2, §13.2–13.4), replacing the hardcoded INDUSTRIES array.
export async function getCountries() {
  const { data } = await client.get('/api/countries/')
  return data
}

export async function getIndustries() {
  const { data } = await client.get('/api/industries/')
  return data
}

// BD users selectable as a lead's owner (assigned_to). Gated to Lead
// Managers / Lead Admins on the backend (the roles that assign owners).
export async function getAssignableUsers() {
  try {
    const { data } = await client.get('/api/assignable-users/')
    return data
  } catch (err) {
    // Only Lead Manager / Lead Admin may read this list; for any other role
    // (e.g. a Resource Manager viewing a task) treat it as simply empty rather
    // than surfacing a 403 error.
    if (err.response?.status === 403) return []
    throw err
  }
}
