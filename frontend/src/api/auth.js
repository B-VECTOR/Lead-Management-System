// Auth + user management, wired to the real Django REST backend (specs.md
// §15/§17): login, logout, token refresh, and the user CRUD API
// (`/api/users/`, with roles/belts resolved via `GET /api/groups/` and
// `GET /api/belts/`) are all live. Only the forgot-password flow and the
// logged-in self-service password change (no backend endpoint exists yet)
// remain mocked against the localStorage DB — flagged below.
import client, { setTokens, clearSession, getRefreshToken } from './client'
import { getBelts, getGroups } from './lookups'
import { getAll, getById, insert, update, genId } from '../mocks/db'
import { groupLabel, IMPLICIT_GROUP_NAME } from '../lib/roles'

// Belts and groups are seeded reference data, effectively static for the
// session, so both lookups are memoized.
let beltsPromise = null
function loadBelts() {
  beltsPromise ||= getBelts()
  return beltsPromise
}

let groupsPromise = null
function loadGroups() {
  groupsPromise ||= getGroups()
  return groupsPromise
}

async function beltIdToName(id) {
  const belts = await loadBelts()
  return belts.find((b) => b.id === id)?.name || 'NA'
}

async function beltNameToId(name) {
  if (!name || name === 'NA') return null
  const belts = await loadBelts()
  return belts.find((b) => b.name === name)?.id ?? null
}

async function groupIdsToLabels(ids) {
  const groups = await loadGroups()
  const byId = new Map(groups.map((g) => [g.id, g.name]))
  return (ids || []).map((id) => byId.get(id)).filter(Boolean).map(groupLabel)
}

// Resolves role-label strings (as used in the Users UI) back to Group PKs,
// and always includes the implicit Employee group — it's granted to every
// user but never shown as a selectable checkbox (see lib/roles.js).
async function roleLabelsToGroupIds(labels) {
  const groups = await loadGroups()
  const byLabel = new Map(groups.map((g) => [groupLabel(g.name), g.id]))
  const employeeId = groups.find((g) => g.name === IMPLICIT_GROUP_NAME)?.id
  const ids = (labels || []).map((label) => byLabel.get(label)).filter((id) => id != null)
  return [...new Set(employeeId != null ? [...ids, employeeId] : ids)]
}

// DRF returns validation errors as { field: [messages] }; surface the first
// one instead of axios's generic "Request failed with status code 400".
function throwApiError(err) {
  const data = err.response?.data
  if (data && typeof data === 'object') {
    const firstVal = data[Object.keys(data)[0]]
    const message = Array.isArray(firstVal) ? firstVal[0] : firstVal
    if (message) throw new Error(String(message))
  }
  throw new Error('Something went wrong. Please try again.')
}

// --- Backend <-> frontend user shape adapter --------------------------------
// The DRF UserSerializer returns { id, email, name, employee_id, mobile_no,
// belt (pk|null), acting_belt_level (pk|null), domain, date_of_joining,
// is_active, groups: [pk] }. The login response is a subset with the same
// shape. Map both to the shape the rest of the app expects.
async function fromApiUser(u) {
  const [belt, acting_belt_level, roles] = await Promise.all([
    beltIdToName(u.belt),
    beltIdToName(u.acting_belt_level),
    groupIdsToLabels(u.groups),
  ])
  return {
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    roles,
    active: u.is_active ?? true,
    employee_id: u.employee_id || '',
    mobile_no: u.mobile_no || '',
    belt,
    acting_belt_level,
    domain: u.domain || '',
    date_of_joining: u.date_of_joining || null,
    manager_id: null,
  }
}

// Converts the Users UI's form shape (role labels, belt names) into the
// backend's expected PKs.
async function toApiPayload(data) {
  const [belt, acting_belt_level, groups] = await Promise.all([
    beltNameToId(data.belt),
    beltNameToId(data.acting_belt_level),
    roleLabelsToGroupIds(data.roles),
  ])
  return {
    name: data.name,
    email: data.email,
    employee_id: data.employee_id || '',
    mobile_no: data.mobile_no || '',
    domain: data.domain || '',
    date_of_joining: data.date_of_joining || null,
    belt,
    acting_belt_level,
    groups,
  }
}

// --- Live backend calls -----------------------------------------------------

export async function login(email, password) {
  try {
    const { data } = await client.post('/api/auth/login/', { email, password })
    setTokens({ access: data.access, refresh: data.refresh })
    return fromApiUser(data.user)
  } catch (err) {
    // DRF returns { detail: "No active account found with the given credentials" }.
    throw new Error(err.response?.data?.detail || 'Login failed. Check your email and password.')
  }
}

export async function logout() {
  const refresh = getRefreshToken()
  try {
    if (refresh) await client.post('/api/auth/logout/', { refresh })
  } catch {
    // Blacklisting is best-effort; clear the local session regardless.
  }
  clearSession()
}

export async function getUsers() {
  const { data } = await client.get('/api/users/')
  const results = Array.isArray(data) ? data : data.results || []
  return Promise.all(results.map(fromApiUser))
}

export async function getUser(id) {
  const { data } = await client.get(`/api/users/${id}/`)
  return fromApiUser(data)
}

export async function resetPassword(id, newPassword) {
  // Password is the one write field that maps cleanly to the frozen API
  // (no group/belt PK resolution needed).
  try {
    const { data } = await client.patch(`/api/users/${id}/`, { password: newPassword })
    return fromApiUser(data)
  } catch (err) {
    throwApiError(err)
  }
}

export async function createUser(data) {
  try {
    const payload = await toApiPayload(data)
    const { data: created } = await client.post('/api/users/', { ...payload, password: data.password })
    return fromApiUser(created)
  } catch (err) {
    throwApiError(err)
  }
}

export async function updateUser(id, patch) {
  try {
    const payload = await toApiPayload(patch)
    if ('active' in patch) payload.is_active = patch.active
    const { data } = await client.patch(`/api/users/${id}/`, payload)
    return fromApiUser(data)
  } catch (err) {
    throwApiError(err)
  }
}

// Logged-in self-service password change (Account settings). Operates on
// the authenticated user (via the JWT), so userId is unused — kept in the
// signature to match useChangeOwnPassword's call shape.
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  try {
    await client.post('/api/auth/change-password/', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  } catch (err) {
    throwApiError(err)
  }
}

// --- Forgot-password flow (mocked — no backend endpoint yet) ----------------
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
