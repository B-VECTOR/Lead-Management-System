// In-app notifications, wired to the real Django REST backend (Phase 8).
//
// Notifications are generated server-side at the events the docs flag as
// notification-worthy (task opened / reassigned, follow-up raised, owner
// assignment). The frontend lists them, marks them read, and shows the unread
// count in the bell.
//
// The list is paginated: the bell pulls a small preview page, the Notifications
// page pulls a page at a time behind "Load more". `unread_count` rides along in
// the envelope so the badge never needs the whole list.
import client from './client'

export async function listNotifications({ page = 1, pageSize = 20, unread = false } = {}) {
  const params = { page, page_size: pageSize }
  if (unread) params.unread = 1
  const { data } = await client.get('/api/notifications/', { params })
  // Tolerate an un-paginated payload (older backend / pagination disabled).
  if (Array.isArray(data)) {
    return {
      results: data,
      count: data.length,
      unreadCount: data.filter((n) => !n.read).length,
      hasMore: false,
    }
  }
  return {
    results: data.results || [],
    count: data.count ?? (data.results || []).length,
    unreadCount: data.unread_count ?? 0,
    hasMore: Boolean(data.next),
  }
}

export async function markRead(id) {
  const { data } = await client.post(`/api/notifications/${id}/read/`)
  return data
}

export async function markAllRead() {
  const { data } = await client.post('/api/notifications/mark-all-read/')
  return data
}

export async function clearRead() {
  const { data } = await client.post('/api/notifications/clear-read/')
  return data
}
