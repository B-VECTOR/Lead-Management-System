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
  if (patch.email) {
    const users = await getAll('users')
    if (users.some((u) => u.id !== id && u.email.toLowerCase() === String(patch.email).toLowerCase())) {
      throw new Error('A user with that email already exists.')
    }
  }
  return update('users', id, patch)
}

export async function resetPassword(id, newPassword) {
  return update('users', id, { password: newPassword })
}

// Logged-in self-service password change (account settings) — distinct from
// resetPassword() above, which is the admin-driven "set someone else's
// password" flow and doesn't check the old one.
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const current = await getById('users', userId)
  if (!current || current.password !== currentPassword) throw new Error('Current password is incorrect.')
  return update('users', userId, { password: newPassword })
}

// --- Forgot-password flow (mocked — no real email/backend yet) -------------
// A real backend would email the link and never reveal whether the address
// exists; since this demo has no mail server, the link itself is shown
// on-screen instead (see pages/ForgotPassword.jsx), same transparency as the
// Login page's "any password works" demo-accounts list.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

export async function requestPasswordReset(email) {
  const users = await getAll('users')
  const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase())
  if (!user) throw new Error('No account found with that email.')
  return insert('passwordResetTokens', {
    id: genId('prt'), user_id: user.id, created_at: new Date().toISOString(), used: false,
  })
}

function isTokenValid(record) {
  return !!record && !record.used && Date.now() - new Date(record.created_at).getTime() <= RESET_TOKEN_TTL_MS
}

export async function verifyResetToken(token) {
  const record = await getById('passwordResetTokens', token)
  if (!isTokenValid(record)) return null
  return getById('users', record.user_id)
}

export async function resetPasswordWithToken(token, newPassword) {
  const record = await getById('passwordResetTokens', token)
  if (!isTokenValid(record)) throw new Error('This reset link is invalid or has expired.')
  await update('users', record.user_id, { password: newPassword })
  await update('passwordResetTokens', token, { used: true })
}
