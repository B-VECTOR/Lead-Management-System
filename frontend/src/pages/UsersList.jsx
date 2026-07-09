import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RoleBadge, BeltBadge } from '@/components/shared/StatusBadge'
import { useUsers } from '@/hooks/useUsers'
import { useGroups, useBelts } from '@/hooks/useLookups'
import { useAuth } from '@/context/AuthContext'
import { PERMISSIONS } from '@/api/scope'
import { groupLabel, IMPLICIT_GROUP_NAME } from '@/lib/roles'

export default function UsersList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canManage = PERMISSIONS.manageUsers(user)

  const { data: users = [], isLoading } = useUsers()
  const { data: groups = [] } = useGroups()
  const { data: belts = [] } = useBelts()
  const selectableRoles = useMemo(
    () => groups.filter((g) => g.name !== IMPLICIT_GROUP_NAME).map((g) => groupLabel(g.name)),
    [groups],
  )
  const beltNames = useMemo(() => belts.map((b) => b.name), [belts])

  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [belt, setBelt] = useState('all')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    if (!canManage) navigate('/dashboard', { replace: true })
  }, [canManage, navigate])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users
      .filter((u) => !needle || [u.name, u.email, u.employee_id].some((v) => v?.toLowerCase().includes(needle)))
      .filter((u) => role === 'all' || u.roles?.includes(role))
      .filter((u) => belt === 'all' || u.belt === belt)
      .filter((u) => status === 'all' || (status === 'active' ? u.active : !u.active))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [users, q, role, belt, status])

  if (!canManage) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Create, manage roles, and control access for everyone in the system.</p>
        </div>
        <Button onClick={() => navigate('/users/new')}>
          <Plus className="size-4" /> New user
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, email, or employee ID…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {selectableRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={belt} onValueChange={setBelt}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Belt" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All belts</SelectItem>
              {beltNames.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Belt</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No users match your filters.</TableCell></TableRow>
              )}
              {filtered.map((u) => (
                <TableRow key={u.id} className="cursor-pointer" onClick={() => navigate(`/users/${u.id}/edit`)}>
                  <TableCell>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell className="text-sm">{u.employee_id || '—'}</TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {(u.roles || []).filter((r) => r !== 'Employee').map((r) => <RoleBadge key={r} role={r} />)}
                      {(u.roles || []).filter((r) => r !== 'Employee').length === 0 && <RoleBadge role="Employee" />}
                    </div>
                  </TableCell>
                  <TableCell><BeltBadge belt={u.belt} /></TableCell>
                  <TableCell className="text-sm">{u.domain || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={u.active ? 'secondary' : 'outline'}>{u.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => navigate(`/users/${u.id}/edit`)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
