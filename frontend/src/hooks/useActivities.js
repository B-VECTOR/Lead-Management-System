import { useQuery } from '@tanstack/react-query'
import * as activitiesApi from '@/api/activities'

// Activity is auto-logged server-side (Phase 8) — read-only on the frontend.
export function useActivitiesForLead(leadId) {
  return useQuery({
    queryKey: ['activities', 'lead', leadId],
    queryFn: () => activitiesApi.getActivitiesForLead(leadId),
    enabled: !!leadId,
  })
}
