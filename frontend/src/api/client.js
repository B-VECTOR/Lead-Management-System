// Shared axios instance for the real Django REST backend (specs.md §17).
//
// Everything except auth + user management still runs against the localStorage
// mock DB (see src/mocks/db.js); this client is used only by the functions in
// src/api/auth.js that have been wired to the live API so far.
//
// It attaches the JWT access token to every request and, on a 401,
// transparently refreshes the token once (SimpleJWT rotates refresh tokens, so
// the new refresh is stored too) before giving up and bouncing to /login.
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const ACCESS_TOKEN_KEY = 'lms-access-token'
export const REFRESH_TOKEN_KEY = 'lms-refresh-token'
export const USER_STORAGE_KEY = 'lms-current-user'

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem(ACCESS_TOKEN_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// De-dupes concurrent refreshes: many requests can 401 at once, but only one
// call to /api/auth/refresh/ should fire.
let refreshPromise = null

function forceLogout() {
  clearSession()
  if (window.location.pathname !== '/login') window.location.assign('/login')
}

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error
    const isRefreshCall = config?.url?.includes('/api/auth/refresh/')
    // Only retry once, and never try to refresh a failed refresh.
    if (response?.status !== 401 || config?._retried || isRefreshCall) {
      return Promise.reject(error)
    }
    const refresh = getRefreshToken()
    if (!refresh) {
      forceLogout()
      return Promise.reject(error)
    }
    try {
      // A bare axios.post (no interceptors) so a 401 here can't recurse.
      refreshPromise = refreshPromise || axios.post(`${BASE_URL}/api/auth/refresh/`, { refresh })
      const { data } = await refreshPromise
      refreshPromise = null
      setTokens({ access: data.access, refresh: data.refresh })
      config._retried = true
      config.headers.Authorization = `Bearer ${data.access}`
      return client(config)
    } catch (refreshErr) {
      refreshPromise = null
      forceLogout()
      return Promise.reject(refreshErr)
    }
  },
)

export default client
