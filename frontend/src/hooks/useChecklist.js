import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as checklistApi from '@/api/checklist'
import { useAuth } from '@/context/AuthContext'

export function useProjectTasks(projectId) {
  return useQuery({ queryKey: ['project-tasks', projectId], queryFn: () => checklistApi.getProjectTasks(projectId), enabled: !!projectId })
}

export function useProjectChecklist(projectId) {
  return useQuery({ queryKey: ['project-checklist', projectId], queryFn: () => checklistApi.getProjectChecklist(projectId), enabled: !!projectId })
}

export function useUpdateChecklistItem(projectId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: ({ id, patch }) => checklistApi.updateChecklistItem(id, patch, user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-checklist', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
