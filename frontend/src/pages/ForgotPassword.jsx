import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRequestPasswordReset } from '@/hooks/useUsers'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const requestReset = useRequestPasswordReset()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await requestReset.mutateAsync(email)
    } catch (err) {
      setError(err.message)
    }
  }

  const token = requestReset.data

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Forgot password</CardTitle>
          <CardDescription>Enter your account email and we'll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={requestReset.isPending} className="mt-1">
                {requestReset.isPending ? 'Sending…' : 'Send reset link'}
              </Button>
              <Link to="/login" className="text-center text-sm text-muted-foreground hover:underline">Back to sign in</Link>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">If that email has an account, a reset link has been sent.</p>
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Mocked — no email server yet</p>
                <p>There's no backend to actually send mail, so here's the link it would have contained:</p>
                <Link to={`/reset-password/${token.id}`} className="mt-1 block truncate text-primary hover:underline">
                  {window.location.origin}/reset-password/{token.id}
                </Link>
              </div>
              <Link to="/login" className="text-center text-sm text-muted-foreground hover:underline">Back to sign in</Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
