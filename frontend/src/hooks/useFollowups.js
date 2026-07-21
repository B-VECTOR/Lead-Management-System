import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as followupsApi from '@/api/followups'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'

// Backend-wired follow-up hooks (Phase 7), replacing the mock-backed module.

export function useFollowups(filters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['followups', user?.id, filters],
    queryFn: () => followupsApi.listFollowups(filters),
    enabled: !!user,
  })
}

// Assignee dropdown — open to whoever can raise a follow-up (Phase 12
// broadened creation beyond Lead-Manager-only; mirrors PERMISSIONS.manageFollowups
// and the backend's CanAddFollowupPermission).
export function useFollowupAssignees() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['followup-assignees'],
    queryFn: followupsApi.listFollowupAssignees,
    enabled: !!user && PERMISSIONS.manageFollowups(user),
  })
}

export function useCreateFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => followupsApi.createFollowup(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useFollowupUpdates(followupId) {
  return useQuery({
    queryKey: ['followup-updates', followupId],
    queryFn: () => followupsApi.listFollowupUpdates(followupId),
    enabled: !!followupId,
  })
}

export function useAddFollowupUpdate(followupId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (comment) => followupsApi.addFollowupUpdate(followupId, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followup-updates', followupId] }),
  })
}

export function useCloseFollowup(followupId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (comment) => followupsApi.closeFollowup(followupId, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followup-updates', followupId] })
      qc.invalidateQueries({ queryKey: ['followups'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
