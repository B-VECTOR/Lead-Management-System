import { useQuery } from '@tanstack/react-query'
import { getGroups, getBelts, getAreas, getCountries, getIndustries, getAssignableUsers } from '@/api/lookups'

// Roles, belts, and areas rarely change, so these are cached longer than user data.
export function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: getGroups, staleTime: 5 * 60_000 })
}

export function useBelts() {
  return useQuery({ queryKey: ['belts'], queryFn: getBelts, staleTime: 5 * 60_000 })
}

export function useAreas() {
  return useQuery({ queryKey: ['areas'], queryFn: getAreas, staleTime: 5 * 60_000 })
}

export function useCountries() {
  return useQuery({ queryKey: ['countries'], queryFn: getCountries, staleTime: 5 * 60_000 })
}

export function useIndustries() {
  return useQuery({ queryKey: ['industries'], queryFn: getIndustries, staleTime: 5 * 60_000 })
}

// BD users for the lead form's "Assigned To" (owner) dropdown. Only Lead
// Managers / Lead Admins can read this, so it's enabled conditionally.
export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: ['assignable-users'],
    queryFn: getAssignableUsers,
    staleTime: 5 * 60_000,
    enabled,
  })
}
