import { useQuery } from '@tanstack/react-query'
import * as dashboardApi from '@/api/dashboard'
import { useAuth } from '@/context/AuthContext'

// One hook per dashboard module (R20). Each takes an `enabled` flag so a
// multi-role user only fetches the modules whose tab they actually open.
//
// The `['dashboard', …]` key prefix is what the finance/allocation mutations
// already invalidate, so a decision taken elsewhere refreshes these too.

export function useDashboardSummary(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'leads', user?.id],
    queryFn: dashboardApi.getDashboardSummary,
    enabled: !!user && enabled,
  })
}

export function useResourceDashboard(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'resources', user?.id],
    queryFn: dashboardApi.getResourceDashboard,
    enabled: !!user && enabled,
  })
}

export function useFinanceDashboard(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'finance', user?.id],
    queryFn: dashboardApi.getFinanceDashboard,
    enabled: !!user && enabled,
  })
}

export function useUserDashboard(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', 'users', user?.id],
    queryFn: dashboardApi.getUserDashboard,
    enabled: !!user && enabled,
  })
}
