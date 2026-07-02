import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { initials } from '@/lib/format'

export function UserChip({ user, size = 'sm' }) {
  if (!user) return <span className="text-muted-foreground text-sm">Unassigned</span>
  const dim = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'
  return (
    <div className="flex items-center gap-2">
      <Avatar className={dim}>
        <AvatarFallback className="text-inherit">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{user.name}</span>
    </div>
  )
}
