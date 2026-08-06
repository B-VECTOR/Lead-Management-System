import { useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import { useIdleTimeout } from '@/hooks/useIdleTimeout'
import { IDLE_TIMEOUT_MS } from '@/lib/session'
import { getMe } from '@/api/auth'

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

const idleMinutes = Math.round(IDLE_TIMEOUT_MS / 60_000)

/**
 * The idle-timeout warning. Mounted inside AppShell, so it exists only for a
 * signed-in user and never on /login or the password-reset screens.
 *
 * Unsaved work is the reason this warns instead of just signing out: these
 * screens hold half-filled task fields and allocation forms, and dropping them
 * without a word is the worst version of this feature.
 */
export function SessionTimeoutDialog() {
  const { user, logout } = useAuth()
  const [extending, setExtending] = useState(false)
  const { warningMsLeft, keepAlive } = useIdleTimeout({
    enabled: Boolean(user),
    onExpire: () => logout('idle'),
  })

  async function staySignedIn() {
    setExtending(true)
    try {
      // Prove the session is still good server-side (and let the axios
      // interceptor rotate an expired access token) before promising the user
      // another window. If the refresh is gone, this 401s and ends the session
      // rather than leaving them clicking into a dead tab.
      await getMe()
      keepAlive()
    } catch {
      await logout('expired')
    } finally {
      setExtending(false)
    }
  }

  const open = warningMsLeft != null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) staySignedIn() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            Still there?
          </DialogTitle>
          <DialogDescription>
            You&apos;ll be signed out in{' '}
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {formatCountdown(warningMsLeft ?? 0)}
            </span>{' '}
            because there&apos;s been no activity for {idleMinutes} minutes. Anything you
            haven&apos;t saved will be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => logout('manual')} disabled={extending}>
            Sign out now
          </Button>
          <Button onClick={staySignedIn} disabled={extending}>
            {extending ? 'Checking…' : 'Stay signed in'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
