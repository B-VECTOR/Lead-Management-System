import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IDLE_WARNING_MS,
  getLastActivity,
  markActivity,
  msUntilIdleLogout,
} from '@/lib/session'

// Events that count as "the user is here". Pointer *movement* is deliberately
// excluded — a mouse nudged by a passing sleeve should not hold a session open
// for a back-office app that people leave on screen all day.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll']

// Writing to localStorage on every keystroke is wasteful and pointless; the
// stamp only has to be accurate to a few seconds against a timeout in minutes.
const WRITE_THROTTLE_MS = 5_000

// A polling tick, not a chain of setTimeouts, because the deadline can move
// under us: another tab can extend it, and a sleeping machine can blow straight
// through a pending timer. Re-reading the shared stamp every second handles
// both without any cross-tab messaging.
const TICK_MS = 1_000

/**
 * Drives the idle-session timeout. Returns the countdown to show in the warning
 * dialog (`warningMsLeft`, null while there is nothing to warn about) and
 * `keepAlive` for the "Stay signed in" button.
 *
 * `onExpire` fires once when the idle window closes; the caller ends the
 * session (which is what actually blacklists the refresh token server-side).
 */
export function useIdleTimeout({ enabled, onExpire }) {
  const [warningMsLeft, setWarningMsLeft] = useState(null)
  const expiredRef = useRef(false)
  const warningRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const keepAlive = useCallback(() => {
    markActivity()
    warningRef.current = false
    setWarningMsLeft(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      warningRef.current = false
      setWarningMsLeft(null)
      return
    }
    expiredRef.current = false
    // A session with no stamp yet (first load after this shipped) starts its
    // clock now rather than counting as idle since the epoch.
    if (getLastActivity() == null) markActivity()

    let lastWrite = 0
    function onActivity() {
      // While the warning is up, only the explicit "Stay signed in" click
      // extends the session. The dialog is modal, so stray clicks land on it —
      // treating them as presence would make the countdown meaningless.
      if (warningRef.current) return
      const now = Date.now()
      if (now - lastWrite < WRITE_THROTTLE_MS) return
      lastWrite = now
      markActivity(now)
    }

    function check() {
      const left = msUntilIdleLogout()
      if (left <= 0) {
        if (expiredRef.current) return
        expiredRef.current = true
        warningRef.current = false
        setWarningMsLeft(null)
        onExpireRef.current?.()
        return
      }
      if (left <= IDLE_WARNING_MS) {
        warningRef.current = true
        setWarningMsLeft(left)
      } else if (warningRef.current) {
        // Another tab (or this one, before the warning) reported activity.
        warningRef.current = false
        setWarningMsLeft(null)
      }
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true })
    }
    // Coming back to a backgrounded tab: check immediately instead of showing a
    // stale screen for up to a second.
    document.addEventListener('visibilitychange', check)
    const timer = setInterval(check, TICK_MS)
    check()

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity, { capture: true })
      }
      document.removeEventListener('visibilitychange', check)
      clearInterval(timer)
    }
  }, [enabled])

  return { warningMsLeft, keepAlive }
}
