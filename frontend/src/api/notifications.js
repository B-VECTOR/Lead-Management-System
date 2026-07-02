import { getAll, insert, update, genId } from '../mocks/db'

export async function listNotifications(userId) {
  const rows = await getAll('notifications')
  return rows.filter((n) => n.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function unreadCount(userId) {
  const rows = await listNotifications(userId)
  return rows.filter((n) => !n.read).length
}

export async function notify({ user_id, type, message, link }) {
  return insert('notifications', { id: genId('n'), user_id, type, message, link, read: false, created_at: new Date().toISOString() })
}

export async function markRead(id) {
  return update('notifications', id, { read: true })
}

export async function markAllRead(userId) {
  const rows = await listNotifications(userId)
  await Promise.all(rows.filter((n) => !n.read).map((n) => update('notifications', n.id, { read: true })))
}
