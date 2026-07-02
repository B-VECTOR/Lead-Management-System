import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUsers, createUser, updateUser } from '@/api/auth'

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: getUsers, staleTime: 60_000 })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
