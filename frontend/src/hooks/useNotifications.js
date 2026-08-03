import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as notificationsApi from '@/api/notifications'
import { useAuth } from '@/context/AuthContext'

// The bell only ever renders a short preview, so it polls one small page
// instead of downloading every notification the user has ever received.
const PREVIEW_SIZE = 6
const PAGE_SIZE = 20

/** Preview page + unread badge count for the topbar bell (polled). */
export function useNotificationPreview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notifications', 'preview', user?.id],
    queryFn: () => notificationsApi.listNotifications({ pageSize: PREVIEW_SIZE }),
    enabled: !!user,
    refetchInterval: 15_000,
  })
}

/** Paged feed for the Notifications page. `unread` restricts it to unread rows. */
export function useNotificationFeed({ unread = false } = {}) {
  const { user } = useAuth()
  return useInfiniteQuery({
    queryKey: ['notifications', 'feed', user?.id, unread],
    queryFn: ({ pageParam }) =>
      notificationsApi.listNotifications({ page: pageParam, pageSize: PAGE_SIZE, unread }),
    enabled: !!user,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length + 1 : undefined),
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

/** Delete the already-read notifications — the manual backlog clear-out. */
export function useClearReadNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.clearRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
