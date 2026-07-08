import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, getUser, createUser, updateUser, resetPassword } from '@/api/auth'

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
