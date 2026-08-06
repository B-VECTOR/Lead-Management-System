// Idle-session clock (R26).
//
// The backend already caps a session with JWT lifetimes (short access token,
// rotating refresh token), but neither cap knows whether anyone is at the
// keyboard: the axios client refreshes silently, so an unattended tab stays
// signed in for as long as the refresh token keeps rotating. This module is the
// missing half — it measures *user* activity, and the timeout it drives ends the
// session (locally, and server-side by blacklisting the refresh token) once
// there has been none for `IDLE_TIMEOUT_MS`.
//
// "Activity" is deliberately DOM events only, never API traffic: the
// notification bell polls every 15 s, so counting requests would keep every
// abandoned tab alive forever.
//
// The stamp lives in localStorage, not React state, so it is shared across
// tabs: working in one tab keeps the others alive, and one tab timing out
// clears the tokens for all of them (see the `storage` listener in
// AuthContext).

const MINUTE_MS = 60_000

function envMinutes(raw, fallbackMinutes) {
  const n = Number(raw)
  return (Number.isFinite(n) && n > 0 ? n : fallbackMinutes) * MINUTE_MS
}

// Configurable per environment; defaults are 30 min idle with a 2 min warning.
export const IDLE_TIMEOUT_MS = envMinutes(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES, 30)
export const IDLE_WARNING_MS = Math.min(
  envMinutes(import.meta.env.VITE_IDLE_WARNING_MINUTES, 2),
  IDLE_TIMEOUT_MS,
)

export const LAST_ACTIVITY_KEY = 'lms-last-activity'
const LOGOUT_REASON_KEY = 'lms-logout-reason'

export function markActivity(at = Date.now()) {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(at))
}

export function clearActivity() {
  localStorage.removeItem(LAST_ACTIVITY_KEY)
}

// null when nothing has been stamped yet — a session that predates this
// feature, or one whose stamp was cleared. Treated as "clock not started"
// rather than "expired", so an existing login is never dropped on arrival.
export function getLastActivity() {
  const raw = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

export function msUntilIdleLogout(now = Date.now()) {
  const last = getLastActivity()
  if (last == null) return IDLE_TIMEOUT_MS
  return IDLE_TIMEOUT_MS - (now - last)
}

// True when the idle window has already elapsed — used on page load, where the
// tab may have been closed (or the machine asleep) far longer than the timeout
// while a still-valid token sat in localStorage.
export function isSessionIdleExpired() {
  return getLastActivity() != null && msUntilIdleLogout() <= 0
}

// Why the user landed back on /login. Kept in localStorage rather than router
// state because the two paths that need it are a full page load (the axios
// force-logout) and a sibling tab reacting to a `storage` event. The Login
// screen reads it once and clears it.
export function setLogoutReason(reason) {
  localStorage.setItem(LOGOUT_REASON_KEY, reason)
}

export function takeLogoutReason() {
  const reason = localStorage.getItem(LOGOUT_REASON_KEY)
  if (reason) localStorage.removeItem(LOGOUT_REASON_KEY)
  return reason
}

export function clearLogoutReason() {
  localStorage.removeItem(LOGOUT_REASON_KEY)
}
