import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as apiLogin, logout as apiLogout } from '@/api/auth'
import { getAccessToken, USER_STORAGE_KEY } from '@/api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate from localStorage. There's no /me endpoint, so we trust the stored
  // user object as long as an access token is present; the axios client will
  // refresh (or force a logout) on the first request if that token is stale.
  useEffect(() => {
    const token = getAccessToken()
    const saved = localStorage.getItem(USER_STORAGE_KEY)
    if (token && saved) {
      try {
        setUser(JSON.parse(saved))
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email, password) => {
    const u = await apiLogin(email, password)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u))
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  // Dev-only helper retained for the RoleSwitcher UI. Password-less switching
  // can't work against real JWT auth, so it's a no-op now (and the switcher's
  // user list is empty against the live backend). Kept so RoleSwitcher doesn't
  // break; remove once role-scoped test accounts exist on the backend.
  const switchUser = useCallback(async () => {
    console.warn('switchUser is disabled: real auth requires signing in with a password.')
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout, switchUser }), [user, loading, login, logout, switchUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
