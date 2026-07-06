// Mock auth. Mirrors POST /api/auth/login (§15) — any password works since
// there's no real backend yet; swap this file's body for an axios call later.
import { getAll, insert, update, genId } from '../mocks/db'

export async function login(email) {
  const users = await getAll('users')
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())
  if (!user) throw new Error('No user found with that email.')
  if (!user.active) throw new Error('This user account is inactive.')
  return user
}

export async function getUsers() {
  return getAll('users')
}

export async function createUser(data) {
  return insert('users', {
    id: genId('u'), name: data.name, email: data.email, role: data.role,
    manager_id: data.manager_id || null, active: true,
  })
}

export async function updateUser(id, patch) {
  return update('users', id, patch)
}
