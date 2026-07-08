// Mock auth + user management. Mirrors POST /api/auth/login (§15) — password
// isn't checked yet since there's no real backend; swap this file's body for
// axios calls later. User CRUD below mirrors the future /api/users/* DRF
// endpoints (§15, to be added) — `password` is stored as plain text purely as
// a mock stand-in for real hashed-password handling.
import { getAll, getById, insert, update, genId } from '../mocks/db'
import { IMPLICIT_ROLE } from '../mocks/seed'

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

export async function getUser(id) {
  return getById('users', id)
}

export async function createUser(data) {
  const users = await getAll('users')
  if (users.some((u) => u.email.toLowerCase() === String(data.email).toLowerCase())) {
    throw new Error('A user with that email already exists.')
  }
  return insert('users', {
    id: genId('u'),
    name: data.name,
    email: data.email,
    password: data.password,
    employee_id: data.employee_id || '',
    mobile_no: data.mobile_no || '',
    acting_belt_level: data.acting_belt_level || 'NA',
    belt: data.belt || 'NA',
    domain: data.domain || '',
    date_of_joining: data.date_of_joining || null,
    roles: [...new Set([...(data.roles || []), IMPLICIT_ROLE])],
    manager_id: data.manager_id || null,
    active: true,
  })
}

export async function updateUser(id, patch) {
  return update('users', id, patch)
}

export async function resetPassword(id, newPassword) {
  return update('users', id, { password: newPassword })
}
