import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as resourcesApi from '@/api/resources'

// Backend-wired resource-allocation + project-closure hooks (Phase 6),
// replacing the old mock resource-request hooks.

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

// `field` scopes the list to that dropdown's belt (execution_red /
// execution_brown / whites); omit for the unfiltered auditor/project-member
// list (Phase 17).
export function useAllocationUsers(field) {
  return useQuery({
    queryKey: ['allocation-users', field],
    queryFn: () => resourcesApi.listAllocationUsers(field),
    staleTime: 5 * 60 * 1000,
  })
}

function useAllocationMutation(mutationFn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-allocations'] })
      qc.invalidateQueries({ queryKey: ['project-closure'] })
      qc.invalidateQueries({ queryKey: ['lead-tasks'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useUpdateAllocation() {
  return useAllocationMutation(({ id, patch }) => resourcesApi.updateResourceAllocation(id, patch))
}

export function useSubmitAllocation() {
  return useAllocationMutation(({ id }) => resourcesApi.submitResourceAllocation(id))
}

export function useProjectClosure(filters = {}) {
  return useQuery({
    queryKey: ['project-closure', filters],
    queryFn: () => resourcesApi.listProjectClosure(filters),
  })
}

export function useShortCloseProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remark }) => resourcesApi.shortCloseProject(id, remark),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-closure'] })
      qc.invalidateQueries({ queryKey: ['lead-tasks'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}
