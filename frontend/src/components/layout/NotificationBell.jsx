import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Link to="/notifications" className="text-xs text-muted-foreground hover:underline">View all</Link>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && <div className="p-4 text-sm text-muted-foreground">You're all caught up.</div>}
          {notifications.slice(0, 8).map((n) => (
            <Link
              key={n.id}
              to={n.link}
              onClick={() => !n.read && markRead.mutate(n.id)}
              className={cn('block border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-accent', !n.read && 'bg-accent/50')}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-600" />}
                <div className={cn('flex-1', n.read && 'pl-3.5')}>
                  <p className="leading-snug">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
