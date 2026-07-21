import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications'
import { formatDateTime } from '@/lib/format'

export default function Notifications() {
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        {unread > 0 && <Button variant="outline" onClick={() => markAllRead.mutate()}>Mark all read</Button>}
      </div>

      <Card className="py-0">
        <CardContent className="flex flex-col divide-y p-0">
          {notifications.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</p>}
          {notifications.map((n) => (
            <Link
              key={n.id}
              to={n.link}
              onClick={() => !n.read && markRead.mutate(n.id)}
              className={cn('flex items-start gap-3 p-4 hover:bg-accent', !n.read && 'bg-accent/40')}
            >
              {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />}
              <div className={cn('flex-1', n.read && 'pl-5')}>
                <p className="text-sm">{n.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.type} · {formatDateTime(n.created_at)}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
