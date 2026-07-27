import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as resourcesApi from '@/api/resources'

// Backend-wired resource-allocation + project-closure hooks (R5 rebuild —
// append-only allocation history, slot actions on allocation tasks).

export function useAllocationTasks(filters = {}) {
  return useQuery({
    queryKey: ['allocation-tasks', filters],
    queryFn: () => resourcesApi.listAllocationTasks(filters),
  })
}

export function useResourceAllocations(filters = {}) {
  return useQuery({
    queryKey: ['resource-allocations', filters],
    queryFn: () => resourcesApi.listResourceAllocations(filters),
  })
}

export function useLeadResourceAllocations(leadId) {
  return useQuery({
    queryKey: ['lead-resource-allocations', leadId],
    queryFn: () => resourcesApi.listLeadResourceAllocations(leadId),
    enabled: !!leadId,
  })
}

// `task` scopes the list to that allocation task's lead (D12); `slot` further
// scopes to the matching belt (Red/Brown/White + Potential) — omit for the
// unfiltered auditor list.
export function useAllocationUsers({ taskId, slot } = {}) {
  return useQuery({
    queryKey: ['allocation-users', taskId, slot],
    queryFn: () => resourcesApi.listAllocationUsers({ taskId, slot }),
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000,
  })
}

function useAllocationMutation(mutationFn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['allocation-tasks'] })
      qc.invalidateQueries({ queryKey: ['resource-allocations'] })
      qc.invalidateQueries({ queryKey: ['lead-resource-allocations'] })
      qc.invalidateQueries({ queryKey: ['project-closure'] })
      qc.invalidateQueries({ queryKey: ['lead-tasks'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useAllocateSlot() {
  return useAllocationMutation(({ taskId, ...payload }) => resourcesApi.allocateSlot(taskId, payload))
}

export function useReassignSlot() {
  return useAllocationMutation(({ taskId, ...payload }) => resourcesApi.reassignSlot(taskId, payload))
}

export function useReleaseSlot() {
  return useAllocationMutation(({ taskId, allocationId }) => resourcesApi.releaseSlot(taskId, allocationId))
}

export function useSubmitAllocationTask() {
  return useAllocationMutation(({ taskId }) => resourcesApi.submitAllocationTask(taskId))
}

export function useProjectClosure(filters = {}) {
  return useQuery({
    queryKey: ['project-closure', filters],
    queryFn: () => resourcesApi.listProjectClosure(filters),
  })
}
