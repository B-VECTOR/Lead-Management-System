import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary } from '@/api/dashboard'
import { useAuth } from '@/context/AuthContext'

export function useDashboardSummary() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: () => getDashboardSummary(),
    enabled: !!user,
  })
}
