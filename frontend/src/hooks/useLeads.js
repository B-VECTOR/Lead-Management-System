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
