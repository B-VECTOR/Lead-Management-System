import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  useClearReadNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
} from '@/hooks/useNotifications'
import { formatDateTime } from '@/lib/format'

export default function Notifications() {
  const [tab, setTab] = useState('unread')
  const unreadOnly = tab === 'unread'
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotificationFeed({
    unread: unreadOnly,
  })
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const clearRead = useClearReadNotifications()

  const pages = data?.pages ?? []
  const notifications = pages.flatMap((p) => p.results)
  const unread = pages[0]?.unreadCount ?? 0
  const total = pages[0]?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              Mark all read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearRead.mutate()}
            disabled={clearRead.isPending}
            title="Delete notifications you have already read"
          >
            Clear read
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="unread">Unread{unread > 0 ? ` (${unread})` : ''}</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="py-0">
        <CardContent className="flex flex-col divide-y p-0">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && notifications.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {unreadOnly ? "You're all caught up." : 'No notifications yet.'}
            </p>
          )}
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

      {(hasNextPage || notifications.length > 0) && (
        <div className="flex flex-col items-center gap-1.5">
          {hasNextPage && (
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Showing {notifications.length} of {total}
          </p>
        </div>
      )}
    </div>
  )
}
