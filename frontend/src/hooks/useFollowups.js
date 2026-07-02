import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as followupsApi from '@/api/followups'
import { useAuth } from '@/context/AuthContext'

export function useFollowups(filters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['followups', user?.id, filters],
    queryFn: () => followupsApi.listFollowups(user, filters),
    enabled: !!user,
  })
}

export function useCreateFollowup() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => followupsApi.createFollowup(data, user),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => followupsApi.updateFollowup(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
