import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getUsers, getUser, createUser, updateUser, resetPassword, changeOwnPassword,
  requestPasswordReset, verifyResetToken, resetPasswordWithToken,
} from '@/api/auth'

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: getUsers, staleTime: 60_000 })
}

export function useUser(id) {
  return useQuery({ queryKey: ['user', id], queryFn: () => getUser(id), enabled: !!id })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => createUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateUser(id, patch),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user', id] })
    },
  })
}

export function useResetPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newPassword }) => resetPassword(id, newPassword),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ['user', id] }),
  })
}

// Logged-in self-service password change (account settings) — requires the
// current password, unlike useResetPassword above (admin resetting someone else's).
export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: ({ userId, currentPassword, newPassword }) => changeOwnPassword(userId, currentPassword, newPassword),
  })
}

// Forgot-password flow (mocked, no real email — see api/auth.js).
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email) => requestPasswordReset(email),
  })
}

export function useVerifyResetToken(token) {
  return useQuery({ queryKey: ['resetToken', token], queryFn: () => verifyResetToken(token), enabled: !!token, retry: false })
}

export function useResetPasswordWithToken() {
  return useMutation({
    mutationFn: ({ token, newPassword }) => resetPasswordWithToken(token, newPassword),
  })
}
