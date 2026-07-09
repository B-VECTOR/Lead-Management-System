import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useVerifyResetToken, useResetPasswordWithToken } from '@/hooks/useUsers'

export default function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { data: account, isLoading } = useVerifyResetToken(token)
  const resetWithToken = useResetPasswordWithToken()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await resetWithToken.mutateAsync({ token, newPassword: password })
      toast.success('Password reset — sign in with your new password')
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  const canSubmit = password.length >= 6 && password === confirmPassword

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Reset password</CardTitle>
          <CardDescription>{account ? `Set a new password for ${account.email}.` : 'Set a new password for your account.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isLoading && !account && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">This reset link is invalid or has expired.</p>
              <Link to="/forgot-password" className="text-center text-sm text-muted-foreground hover:underline">Request a new link</Link>
            </div>
          )}
          {(isLoading || account) && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} required />
                {confirmPassword && password !== confirmPassword && <p className="text-xs text-destructive">Passwords don't match.</p>}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={isLoading || !canSubmit || resetWithToken.isPending} className="mt-1">
                {resetWithToken.isPending ? 'Saving…' : 'Reset password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
