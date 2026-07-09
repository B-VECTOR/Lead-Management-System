import { useQuery } from '@tanstack/react-query'
import { getGroups, getBelts } from '@/api/lookups'

// Roles and belts rarely change, so these are cached longer than user data.
export function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: getGroups, staleTime: 5 * 60_000 })
}

export function useBelts() {
  return useQuery({ queryKey: ['belts'], queryFn: getBelts, staleTime: 5 * 60_000 })
}
