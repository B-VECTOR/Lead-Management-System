import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as holdsApi from '@/api/holds'

// Backend-wired hold/unhold hooks (Phase 5). Ids are passed at mutate time
// (`mutate({ leadId })` / `mutate({ taskId, leadId })`) so the same hook serves
// both the lead-detail screen and the Held Leads / Held Tasks list pages.
// onSuccess invalidates the affected lead + its tasks and the two held lists.

function useHoldMutation(mutationFn) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (_data, vars = {}) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['held-leads'] })
      qc.invalidateQueries({ queryKey: ['held-tasks'] })
      if (vars.leadId) {
        qc.invalidateQueries({ queryKey: ['lead', String(vars.leadId)] })
        qc.invalidateQueries({ queryKey: ['lead-tasks', String(vars.leadId)] })
      }
    },
  })
}

export function useHoldLead() {
  return useHoldMutation(({ leadId }) => holdsApi.holdLead(leadId))
}

export function useUnholdLead() {
  return useHoldMutation(({ leadId }) => holdsApi.unholdLead(leadId))
}

export function useHoldTask() {
  return useHoldMutation(({ taskId }) => holdsApi.holdTask(taskId))
}

export function useUnholdTask() {
  return useHoldMutation(({ taskId }) => holdsApi.unholdTask(taskId))
}

export function useHeldLeads() {
  return useQuery({ queryKey: ['held-leads'], queryFn: holdsApi.listHeldLeads })
}

export function useHeldTasks() {
  return useQuery({ queryKey: ['held-tasks'], queryFn: holdsApi.listHeldTasks })
}
