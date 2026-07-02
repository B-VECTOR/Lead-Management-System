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

export function useUpdateLeadStatus() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, status, extra }) => leadsApi.updateLeadStatus(id, status, extra, user),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useAssignLeadOwner() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, ownerId }) => leadsApi.assignLeadOwner(id, ownerId, user),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', id] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useArchiveLead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (id) => leadsApi.archiveLead(id, user),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}
