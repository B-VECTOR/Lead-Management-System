// Resource allocation + Project closure, wired to the real Django REST backend
// (Phase 6 — Tech Req §4.7–4.8, §7, §9; PRD §5.7, §5.12, §5.15).
//
// These screens are owned by the Resource Manager role; the backend gates every
// endpoint with ResourceManagerPermission. The list helpers swallow a 403 into
// an empty array so the same modules can back the read-only Resources tab on a
// lead detail for non-RM users without surfacing an error.
import client from './client'

function firstMessage(data) {
  if (data == null) return null
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return firstMessage(data[0])
  if (typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const msg = firstMessage(data[key])
      if (msg) return msg
    }
  }
  return null
}

function throwApiError(err) {
  const msg = firstMessage(err.response?.data)
  throw new Error(msg || 'Something went wrong. Please try again.')
}

function rows(data) {
  return Array.isArray(data) ? data : data.results || []
}

// --- Resource allocation ----------------------------------------------------

export async function listResourceAllocations({ leadId, status } = {}) {
  const params = {}
  if (leadId) params.lead = leadId
  if (status) params.status = status
  try {
    const { data } = await client.get('/api/resource-allocations/', { params })
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403) return []
    throw err
  }
}

export async function getResourceAllocation(id) {
  const { data } = await client.get(`/api/resource-allocations/${id}/`)
  return data
}

export async function updateResourceAllocation(id, patch) {
  try {
    const { data } = await client.patch(`/api/resource-allocations/${id}/`, patch)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function submitResourceAllocation(id) {
  try {
    const { data } = await client.post(`/api/resource-allocations/${id}/submit/`)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function listAllocationUsers() {
  try {
    const { data } = await client.get('/api/allocation-users/')
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403) return []
    throw err
  }
}

// --- Project closure --------------------------------------------------------

export async function listProjectClosure({ leadId } = {}) {
  const params = {}
  if (leadId) params.lead = leadId
  try {
    const { data } = await client.get('/api/project-closure/', { params })
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403) return []
    throw err
  }
}

export async function shortCloseProject(id) {
  try {
    const { data } = await client.post(`/api/project-closure/${id}/short-close/`)
    return data
  } catch (err) {
    throwApiError(err)
  }
}
