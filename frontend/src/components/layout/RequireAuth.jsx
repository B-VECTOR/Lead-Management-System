import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { hasRole } from '@/api/scope'

// `roles` gates a route to specific role names; `check(user)` is a predicate
// for finer module gating (e.g. canSeeLeadModule). Either failing sends an
// authenticated-but-unauthorized user back to /dashboard, so a role can no
// longer reach another module's screen just by typing its URL.
// No `from` state on the login redirect — login always lands on /dashboard.
export function RequireAuth({ children, roles, check }) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.some((r) => hasRole(user, r))) return <Navigate to="/dashboard" replace />
  if (check && !check(user)) return <Navigate to="/dashboard" replace />
  return children
}
