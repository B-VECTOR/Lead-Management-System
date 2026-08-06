import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as apiLogin, logout as apiLogout, getMe } from '@/api/auth'
import { ACCESS_TOKEN_KEY, getAccessToken, USER_STORAGE_KEY } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import {
  clearActivity,
  clearLogoutReason,
  isSessionIdleExpired,
  markActivity,
  setLogoutReason,
} from '@/lib/session'

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
    // R26: the stored token can still be valid while the *session* is over —
    // the tab was closed, or the machine asleep, longer than the idle window.
    // Nothing may be restored from that state, so this runs before `/me`.
    // `apiLogout` (not a bare `clearSession`) because the refresh token is
    // still good server-side for up to its full lifetime otherwise; it has to
    // be blacklisted, exactly as on the in-session timeout path. It clears
    // local storage itself, and best-effort — a failure still leaves us here.
    if (isSessionIdleExpired()) {
      setLogoutReason('idle')
      apiLogout()
      setLoading(false)
      return
    }
    // Loading the app is itself activity: restart the idle clock.
    markActivity()
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

  // Cross-tab: `clearSession` removes the tokens key by key, so a logout (or an
  // idle timeout) in any tab reaches the others here rather than leaving them
  // sitting on a signed-in shell until their next request 401s.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === ACCESS_TOKEN_KEY && e.newValue === null) {
        setUser(null)
        queryClient.clear()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const login = useCallback(async (username, password) => {
    // Drop any cached queries from a prior session before signing in, so the
    // new user never sees the previous user's leads/tasks/etc.
    queryClient.clear()
    const u = await apiLogin(username, password)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u))
    clearLogoutReason()
    markActivity()
    setUser(u)
    return u
  }, [])

  // `reason` ('idle' | 'expired' | 'manual') is what the Login screen explains
  // the sign-out with. Guarded because `onClick={logout}` would hand us an
  // event object.
  const logout = useCallback(async (reason) => {
    await apiLogout()
    clearActivity()
    if (typeof reason === 'string' && reason !== 'manual') setLogoutReason(reason)
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
