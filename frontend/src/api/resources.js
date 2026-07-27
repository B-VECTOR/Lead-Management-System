// Resource allocation + Project closure, wired to the real Django REST backend
// (R5 rebuild — append-only allocation history — Tech Req §4.7, §7, §9.1;
// PRD §5.7. Project closure is unchanged — Tech Req §4.8, §9.2; PRD §5.12/§5.15).
//
// Allocation actions (allocate/reassign/release/submit) are gated by D12: the
// Resource Manager, or the specific lead's Default BD Person. The list helpers
// swallow a 403 into an empty array so the same modules can back the read-only
// Resources tab on a lead detail for non-RM users without surfacing an error.
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

// --- Allocation tasks (the Resources screen's main list) --------------------

export async function listAllocationTasks({ leadId, status } = {}) {
  const params = {}
  if (leadId) params.lead = leadId
  if (status) params.status = status
  try {
    const { data } = await client.get('/api/allocation-tasks/', { params })
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403) return []
    throw err
  }
}

export async function allocateSlot(taskId, { slot, userId, isTbd, remark } = {}) {
  try {
    const { data } = await client.post(`/api/allocation-tasks/${taskId}/allocate/`, {
      slot, user_id: userId ?? null, is_tbd: !!isTbd, remark: remark || '',
    })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function reassignSlot(taskId, { allocationId, userId, isTbd, remark } = {}) {
  try {
    const { data } = await client.post(`/api/allocation-tasks/${taskId}/reassign/`, {
      allocation_id: allocationId, user_id: userId ?? null, is_tbd: !!isTbd, remark: remark || '',
    })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function releaseSlot(taskId, allocationId) {
  try {
    const { data } = await client.post(`/api/allocation-tasks/${taskId}/release/`, {
      allocation_id: allocationId,
    })
    return data
  } catch (err) {
    throwApiError(err)
  }
}

export async function submitAllocationTask(taskId) {
  try {
    const { data } = await client.post(`/api/allocation-tasks/${taskId}/submit/`)
    return data
  } catch (err) {
    throwApiError(err)
  }
}

// `task` (required) scopes the picker to that allocation task's lead (D12);
// `slot` optionally further scopes to the Belt matching that slot (Red/Brown/
// White + Potential) — omit for the unfiltered auditor list.
export async function listAllocationUsers({ taskId, slot } = {}) {
  if (!taskId) return []
  const params = { task: taskId }
  if (slot) params.slot = slot
  try {
    const { data } = await client.get('/api/allocation-users/', { params })
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) return []
    throw err
  }
}

// --- Resource-allocation row history (RM reporting + resource-history) -----

export async function listResourceAllocations({ leadId, status, slot } = {}) {
  const params = {}
  if (leadId) params.lead = leadId
  if (status) params.status = status
  if (slot) params.slot = slot
  try {
    const { data } = await client.get('/api/resource-allocations/', { params })
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403) return []
    throw err
  }
}

// Lead-scoped allocation history for the Lead Detail "Resources" tab — visible
// to the lead's own people (assignee/creator/LM/Lead Admin), not just the RM.
// A 403/404 (lead out of scope) degrades to an empty list.
export async function listLeadResourceAllocations(leadId) {
  try {
    const { data } = await client.get(`/api/leads/${leadId}/resource-allocations/`)
    return rows(data)
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) return []
    throw err
  }
}

// --- Project closure --------------------------------------------------------

// `leadId` broadens to that lead's whole base_code family (parent + any
// Mining children, §13) — the backend groups them so implementation, each
// extension, and any mining cycle show up together (§9.2, R6).
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
