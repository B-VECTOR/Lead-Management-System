import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as projectsApi from '@/api/projects'
import { useAuth } from '@/context/AuthContext'

export function useProjectsForLead(leadId) {
  return useQuery({
    queryKey: ['projects', 'lead', leadId],
    queryFn: () => projectsApi.listProjectsForLead(leadId),
    enabled: !!leadId,
  })
}

export function useProjects(filters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['projects', user?.id, filters],
    queryFn: () => projectsApi.listProjects(user, filters),
    enabled: !!user,
  })
}

export function useProject(id) {
  return useQuery({ queryKey: ['project', id], queryFn: () => projectsApi.getProject(id), enabled: !!id })
}

export function useCreateProject(leadId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => projectsApi.createProject(leadId, data, user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', 'lead', leadId] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', leadId] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, patch }) => projectsApi.updateProject(id, patch, user),
    onSuccess: (data, { id }) => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['projects', 'lead', data.lead_id] })
    },
  })
}

export function useAssignProject() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, assignedTo }) => projectsApi.assignProject(id, assignedTo, user),
    onSuccess: (data, { id }) => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['projects', 'lead', data.lead_id] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
