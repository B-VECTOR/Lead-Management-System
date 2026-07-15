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
        qc.invalidateQueries({ queryKey: ['activities', 'lead', String(vars.leadId)] })
      }
    },
  })
}

export function useHoldLead() {
  return useHoldMutation(({ leadId, remark }) => holdsApi.holdLead(leadId, remark))
}

export function useUnholdLead() {
  return useHoldMutation(({ leadId, remark }) => holdsApi.unholdLead(leadId, remark))
}

export function useHoldTask() {
  return useHoldMutation(({ taskId, remark }) => holdsApi.holdTask(taskId, remark))
}

export function useUnholdTask() {
  return useHoldMutation(({ taskId, remark }) => holdsApi.unholdTask(taskId, remark))
}

export function useHeldLeads() {
  return useQuery({ queryKey: ['held-leads'], queryFn: holdsApi.listHeldLeads })
}

export function useHeldTasks() {
  return useQuery({ queryKey: ['held-tasks'], queryFn: holdsApi.listHeldTasks })
}
