import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as checklistApi from '@/api/checklist'
import { useAuth } from '@/context/AuthContext'

export function useLeadTasks(leadId) {
  return useQuery({ queryKey: ['lead-tasks', leadId], queryFn: () => checklistApi.getLeadTasks(leadId), enabled: !!leadId })
}

export function useLeadChecklist(leadId) {
  return useQuery({ queryKey: ['lead-checklist', leadId], queryFn: () => checklistApi.getLeadChecklist(leadId), enabled: !!leadId })
}

export function useUpdateChecklistItem(leadId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, patch }) => checklistApi.updateChecklistItem(id, patch, user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-checklist', leadId] })
      qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['all-checklist-items'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateChecklistItemNotes(leadId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }) => checklistApi.updateChecklistItemNotes(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-checklist', leadId] }),
  })
}

export function useAllChecklistItems(filters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['all-checklist-items', user?.id, filters],
    queryFn: () => checklistApi.listAllChecklistItems(user, filters),
    enabled: !!user,
  })
}

export function useLeadTaskFields(taskId) {
  return useQuery({
    queryKey: ['lead-task-fields', taskId],
    queryFn: () => checklistApi.getLeadTaskFields(taskId),
    enabled: !!taskId,
  })
}

export function useUpdateLeadTaskFieldValue(taskId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, value }) => checklistApi.updateLeadTaskFieldValue(fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-task-fields', taskId] }),
  })
}
