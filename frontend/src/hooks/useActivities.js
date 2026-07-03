import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as activitiesApi from '@/api/activities'
import { useAuth } from '@/context/AuthContext'

export function useActivitiesForLead(leadId) {
  return useQuery({
    queryKey: ['activities', 'lead', leadId],
    queryFn: () => activitiesApi.getActivitiesForLead(leadId),
    enabled: !!leadId,
  })
}

export function useLogActivity(leadId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => activitiesApi.logActivity({ ...data, lead_id: leadId, created_by: user.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', 'lead', leadId] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
    },
  })
}
