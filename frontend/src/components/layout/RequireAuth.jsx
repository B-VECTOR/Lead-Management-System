import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { hasRole } from '@/api/scope'

export function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (roles && !roles.some((r) => hasRole(user, r))) return <Navigate to="/dashboard" replace />
  return children
}
