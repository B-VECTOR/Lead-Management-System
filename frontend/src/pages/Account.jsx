import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge, BeltBadge } from '@/components/shared/StatusBadge'
import { useAuth } from '@/context/AuthContext'
import { useChangeOwnPassword } from '@/hooks/useUsers'
import { formatDate, initials } from '@/lib/format'

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default function Account() {
  const { user } = useAuth()
  const changePassword = useChangeOwnPassword()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await changePassword.mutateAsync({ userId: user.id, currentPassword, newPassword })
      toast.success('Password updated')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    }
  }

  const canSubmit = currentPassword && newPassword.length >= 6 && newPassword === confirmPassword

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-10"><AvatarFallback>{initials(user.name)}</AvatarFallback></Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Roles</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {(user.roles || []).map((r) => <RoleBadge key={r} role={r} />)}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Basic info</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Employee ID" value={user.employee_id} />
            <InfoRow label="Mobile no." value={user.mobile_no} />
            <InfoRow label="Domain" value={user.domain} />
            <InfoRow label="Date of joining" value={formatDate(user.date_of_joining)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Belt</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Acting belt level</span>
              <BeltBadge belt={user.acting_belt_level} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Belt</span>
              <BeltBadge belt={user.belt} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 sm:max-w-sm">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                {confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-destructive">Passwords don't match.</p>}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <Button type="submit" disabled={!canSubmit || changePassword.isPending}>
                {changePassword.isPending ? 'Saving…' : 'Update password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
