import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LogoWordmark } from '@/components/layout/Logo'
import { useAuth } from '@/context/AuthContext'
import { takeLogoutReason } from '@/lib/session'

const LOGOUT_NOTICES = {
  idle: 'You were signed out because you were inactive. Sign in to continue.',
  expired: 'Your session expired. Sign in to continue.',
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Read once on mount and cleared in the same breath, so the notice explains
  // *this* redirect and doesn't survive a manual visit to /login later. Shown
  // as a toast rather than inside the card so the sign-in form never shifts
  // down — and so the same message reads the same way here as everywhere else.
  useEffect(() => {
    const notice = LOGOUT_NOTICES[takeLogoutReason()]
    // A fixed id collapses the duplicate that StrictMode's double-mount would
    // otherwise produce in dev.
    if (notice) toast.warning(notice, { id: 'session-ended', duration: 8000 })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      // Always land on the dashboard — restoring the pre-logout page sent
      // users to screens the new session may not be allowed to see (e.g. a
      // lead detail showing "not assigned").
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="justify-items-center gap-2 text-center">
          <LogoWordmark className="h-auto w-32 max-w-full" />
          <CardTitle className="text-lg">Lead Management System</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" type="text" autoComplete="username" placeholder="your.username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting} className="mt-1">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
