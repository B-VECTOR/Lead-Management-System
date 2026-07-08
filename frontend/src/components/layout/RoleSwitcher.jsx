import { FlaskConical } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/context/AuthContext'
import { useUsers } from '@/hooks/useUsers'
import { displayRoles } from '@/lib/format'

// Dev-only: lets you jump between the seeded Admin/Manager/Representative
// accounts to exercise role-based scoping (§2.1) before real login exists.
export function RoleSwitcher() {
  const { user, switchUser } = useAuth()
  const { data: users = [] } = useUsers()

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1">
      <FlaskConical className="size-3.5 text-muted-foreground" />
      <Select value={user?.email} onValueChange={switchUser}>
        <SelectTrigger size="sm" className="h-7 border-0 shadow-none focus-visible:ring-0">
          <SelectValue placeholder="Switch user" />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.email}>
              {u.name} · {displayRoles(u)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
