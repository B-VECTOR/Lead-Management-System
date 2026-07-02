import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { login as apiLogin } from '@/api/auth'

const AuthContext = createContext(null)
const STORAGE_KEY = 'lms-current-user-id'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_KEY)
    if (savedEmail) {
      apiLogin(savedEmail).then(setUser).catch(() => localStorage.removeItem(STORAGE_KEY)).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email) => {
    const u = await apiLogin(email)
    localStorage.setItem(STORAGE_KEY, u.email)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  // Dev-only helper: switch the active user without a password, so the three
  // roles' permission scoping (specs.md §2.1) can be exercised side by side
  // before real auth exists.
  const switchUser = useCallback(async (email) => login(email), [login])

  const value = useMemo(() => ({ user, loading, login, logout, switchUser }), [user, loading, login, logout, switchUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
