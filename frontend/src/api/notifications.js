// In-app notifications, wired to the real Django REST backend (Phase 8).
//
// Notifications are generated server-side at the events the docs flag as
// notification-worthy (task opened / reassigned, follow-up raised, owner
// assignment). The frontend lists them, marks them read, and shows the unread
// count in the bell.
import client from './client'

export async function listNotifications() {
  const { data } = await client.get('/api/notifications/')
  return Array.isArray(data) ? data : data.results || []
}

export async function markRead(id) {
  const { data } = await client.post(`/api/notifications/${id}/read/`)
  return data
}

export async function markAllRead() {
  const { data } = await client.post('/api/notifications/mark-all-read/')
  return data
}
