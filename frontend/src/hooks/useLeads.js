import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as leadsApi from '@/api/leads'
import { useAuth } from '@/context/AuthContext'

export function useLeads(filters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['leads', user?.id, filters],
    queryFn: () => leadsApi.listLeads(user, filters),
    enabled: !!user,
  })
}

export function useLead(id) {
  return useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.getLead(id), enabled: !!id })
}

export function useCreateLead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => leadsApi.createLead(data, user),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, patch }) => leadsApi.updateLead(id, patch, user),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', id] })
    },
  })
}

export function useDropLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remark }) => leadsApi.dropLead(id, remark),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['lead-tasks', String(id)] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// Short-close (R6, §9.2/§5.12) — opens Project Closure ahead of its natural
// trigger; invalidates the closure list too since it may create/close cycles.
export function useShortCloseLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, remark }) => leadsApi.shortCloseLead(id, remark),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['lead-tasks', String(id)] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', id] })
      qc.invalidateQueries({ queryKey: ['project-closure'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      // The Resource module's queue is a short-close surface too now (its group
      // headers carry the button), and the sweep + resource release changes what
      // it shows — its own rows go `skipped`, and the closure task's `on_open`
      // frees the allocations.
      qc.invalidateQueries({ queryKey: ['allocation-tasks'] })
      qc.invalidateQueries({ queryKey: ['resource-allocations'] })
      qc.invalidateQueries({ queryKey: ['lead-resource-allocations'] })
    },
  })
}

export function useAssignLeadOwner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ownerId, remark }) => leadsApi.assignLeadOwner(id, ownerId, remark),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['lead-tasks', String(id)] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', id] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// Note: the old owner/rep split and archive action are gone in the v12 model —
// a lead has a single `assigned_to` owner (use useAssignLeadOwner), and it is
// cancelled via the drop action (useDropLead), not archived.
