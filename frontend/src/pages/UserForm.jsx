import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUser, useCreateUser, useUpdateUser, useResetPassword } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { SELECTABLE_ROLES, BELT_LEVELS, DOMAINS } from '@/mocks/seed'

// User Management is a single-holder role — it's only ever changed by editing
// the person who already has it, never picked when creating someone new.
const CREATABLE_ROLES = SELECTABLE_ROLES.filter((r) => r !== 'User Management')

const emptyForm = {
  name: '', employee_id: '', email: '', mobile_no: '', date_of_joining: '',
  acting_belt_level: 'NA', belt: 'NA', domain: '', roles: [],
  password: '', confirmPassword: '', active: true,
}

export default function UserForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = PERMISSIONS.manageUsers(user)

  const { data: existingUser } = useUser(isEdit ? id : undefined)
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const resetPassword = useResetPassword()

  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    if (!canManage) navigate('/dashboard', { replace: true })
  }, [canManage, navigate])

  useEffect(() => {
    if (isEdit && existingUser) {
      setForm({
        name: existingUser.name || '', employee_id: existingUser.employee_id || '',
        email: existingUser.email || '', mobile_no: existingUser.mobile_no || '',
        date_of_joining: existingUser.date_of_joining ? existingUser.date_of_joining.slice(0, 10) : '',
        acting_belt_level: existingUser.acting_belt_level || 'NA', belt: existingUser.belt || 'NA',
        domain: existingUser.domain || '', roles: (existingUser.roles || []).filter((r) => r !== 'Employee'),
        password: '', confirmPassword: '', active: existingUser.active,
      })
    }
  }, [isEdit, existingUser])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleRole(role, checked) {
    setForm((f) => ({
      ...f,
      roles: checked ? [...f.roles, role] : f.roles.filter((r) => r !== role),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      name: form.name, employee_id: form.employee_id, email: form.email, mobile_no: form.mobile_no,
      date_of_joining: form.date_of_joining || null, acting_belt_level: form.acting_belt_level,
      belt: form.belt, domain: form.domain, roles: form.roles,
    }
    try {
      if (isEdit) {
        await updateUser.mutateAsync({ id, patch: { ...payload, active: form.active } })
        if (form.password) await resetPassword.mutateAsync({ id, newPassword: form.password })
        toast.success('User updated')
        navigate('/users')
      } else {
        const created = await createUser.mutateAsync({ ...payload, password: form.password })
        toast.success('User created')
        navigate('/users')
      }
    } catch (err) {
      toast.error(err.message)
    }
  }

  const saving = createUser.isPending || updateUser.isPending || resetPassword.isPending
  const availableRoles = isEdit ? SELECTABLE_ROLES : CREATABLE_ROLES

  const basicFieldsFilled = form.name.trim() && form.employee_id.trim() && form.email.trim()
    && form.mobile_no.trim() && form.date_of_joining && form.domain

  const newPasswordOk = isEdit
    ? !form.password || form.password.length >= 6
    : form.password.length >= 6 && form.password === form.confirmPassword

  const canSubmit = isEdit
    ? basicFieldsFilled && newPasswordOk
    : basicFieldsFilled && form.roles.length > 0 && newPasswordOk

  if (!canManage) return null
  if (isEdit && !existingUser) return <div className="text-sm text-muted-foreground">Loading user…</div>

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Edit user' : 'New user'}</h1>
        <p className="text-sm text-muted-foreground">Every user is automatically granted the Employee role, on top of anything selected below.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Basic info</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Priya Nair" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Employee ID *</Label>
            <Input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} placeholder="e.g. EMP-1011" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Mobile no. *</Label>
            <Input value={form.mobile_no} onChange={(e) => set('mobile_no', e.target.value)} placeholder="e.g. 9820011011" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date of joining *</Label>
            <Input type="date" value={form.date_of_joining} onChange={(e) => set('date_of_joining', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Belt & domain</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Acting belt level (current) *</Label>
            <Select value={form.acting_belt_level} onValueChange={(v) => v && set('acting_belt_level', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BELT_LEVELS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Belt *</Label>
            <Select value={form.belt} onValueChange={(v) => v && set('belt', v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BELT_LEVELS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Domain *</Label>
            <Select value={form.domain} onValueChange={(v) => v && set('domain', v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select domain" /></SelectTrigger>
              <SelectContent>
                {DOMAINS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Roles{!isEdit ? ' *' : ''}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {availableRoles.map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.roles.includes(role)} onCheckedChange={(checked) => toggleRole(role, checked)} />
                {role}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Employee is granted automatically to every user and isn't shown here.
            {!isEdit && ' User Management can only belong to one person — grant it by editing that person directly.'}
          </p>
        </CardContent>
      </Card>

      {isEdit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={form.active ? 'active' : 'inactive'} onValueChange={(v) => v && set('active', v === 'active')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>New password</Label>
              <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Leave blank to keep unchanged" />
              {form.password && form.password.length < 6 && <p className="text-xs text-destructive">Must be at least 6 characters.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {!isEdit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Password</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 6 characters" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Confirm password *</Label>
              <Input type="password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} />
              {form.confirmPassword && form.password !== form.confirmPassword && (
                <p className="text-xs text-destructive">Passwords don't match.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" disabled={saving || !canSubmit}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  )
}
