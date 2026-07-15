import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as tasksApi from '@/api/tasks'

// Backend-wired task/checklist hooks (Phase 4), replacing the mock-backed
// useChecklist hooks for the lead task stepper.

export function useLeadTasks(leadId) {
  return useQuery({
    queryKey: ['lead-tasks', leadId],
    queryFn: () => tasksApi.listLeadTasks(leadId),
    enabled: !!leadId,
  })
}

function useTaskMutation(leadId, mutationFn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-tasks', leadId] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['activities', 'lead', leadId] })
    },
  })
}

export function useSaveTaskDraft(leadId) {
  return useTaskMutation(leadId, ({ taskId, extraFields }) =>
    tasksApi.saveTaskDraft(taskId, extraFields),
  )
}

export function useCompleteTask(leadId) {
  return useTaskMutation(leadId, ({ taskId }) => tasksApi.completeTask(taskId))
}

export function useReassignTask(leadId) {
  return useTaskMutation(leadId, ({ taskId, userId, remark }) =>
    tasksApi.reassignTask(taskId, userId, remark),
  )
}

export function useUpdateChecklistItem(leadId) {
  return useTaskMutation(leadId, ({ itemId, patch }) =>
    tasksApi.updateChecklistItem(itemId, patch),
  )
}
