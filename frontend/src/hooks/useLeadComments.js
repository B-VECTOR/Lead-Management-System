import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as leadCommentsApi from '@/api/leadComments'

// Lead Trail (R23-1). Adding a comment also invalidates `notifications`: the
// post notifies the lead's owner/creator, so an author who is one of them would
// otherwise not see their own bell update until the next poll.

export function useLeadComments(leadId) {
  return useQuery({
    queryKey: ['lead-comments', leadId],
    queryFn: () => leadCommentsApi.listLeadComments(leadId),
    enabled: !!leadId,
  })
}

export function useAddLeadComment(leadId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (comment) => leadCommentsApi.addLeadComment(leadId, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-comments', leadId] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
