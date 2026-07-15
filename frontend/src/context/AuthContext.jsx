import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as apiLogin, logout as apiLogout, getMe } from '@/api/auth'
import { getAccessToken, USER_STORAGE_KEY } from '@/api/client'
import { queryClient } from '@/lib/queryClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate from localStorage for an instant first paint, then confirm the
  // session against the backend `/me` endpoint (Phase 8). If the token is
  // stale the axios client refreshes it or forces a logout; if `/me` still
  // fails we clear the stored user rather than trust a stale copy.
  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }
    const saved = localStorage.getItem(USER_STORAGE_KEY)
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    }
    getMe()
      .then((fresh) => {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fresh))
        setUser(fresh)
      })
      .catch(() => {
        // A hard 401 (not recoverable by refresh) — drop the stored identity.
        localStorage.removeItem(USER_STORAGE_KEY)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    // Drop any cached queries from a prior session before signing in, so the
    // new user never sees the previous user's leads/tasks/etc.
    queryClient.clear()
    const u = await apiLogin(username, password)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u))
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    // Purge the React Query cache — it's a module-level singleton, so without
    // this the next login would flash the previous user's cached data.
    queryClient.clear()
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
