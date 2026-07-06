import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as resourcesApi from '@/api/resources'
import { useAuth } from '@/context/AuthContext'

export function useResourceRequests(leadId) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['resource-requests', user?.id, leadId],
    queryFn: () => resourcesApi.listResourceRequests(user, { leadId }),
    enabled: !!user && !!leadId,
  })
}

export function useCreateResourceRequest() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => resourcesApi.createResourceRequest(data, user),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resource-requests'] }),
  })
}
