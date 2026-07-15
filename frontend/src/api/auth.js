// Auth + user management, fully wired to the real Django REST backend: login,
// logout, token refresh, `/me`, the self-service password change, the
// forgot-password flow (Phase 8), and the user CRUD API (`/api/users/`, with
// roles/belts resolved via `GET /api/groups/` and `GET /api/belts/`).
import client, { setTokens, clearSession, getRefreshToken } from './client'
import { getBelts, getGroups, getAreas } from './lookups'
import { groupLabel, IMPLICIT_GROUP_NAME } from '../lib/roles'

// Belts, groups, and areas are seeded reference data, effectively static for
// the session, so the lookups are memoized.
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

let areasPromise = null
function loadAreas() {
  areasPromise ||= getAreas()
  return areasPromise
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

// Domain is a FK → areas; the UI works in area names (like belts), so map
// pk <-> name at the API boundary. An unset domain surfaces as the literal
// "NA" option (mirrors belts) and "NA" maps back to a null FK on write.
async function areaIdToName(id) {
  if (id == null) return 'NA'
  const areas = await loadAreas()
  return areas.find((a) => a.id === id)?.name || 'NA'
}

async function areaNameToId(name) {
  if (!name || name === 'NA') return null
  const areas = await loadAreas()
  return areas.find((a) => a.name === name)?.id ?? null
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
  const [belt, acting_belt_level, roles, domain] = await Promise.all([
    beltIdToName(u.belt),
    beltIdToName(u.acting_belt_level),
    groupIdsToLabels(u.groups),
    areaIdToName(u.domain),
  ])
  return {
    id: u.id,
    username: u.username || '',
    name: u.name || u.username || u.email,
    email: u.email,
    roles,
    active: u.is_active ?? true,
    employee_id: u.employee_id ?? '',
    mobile_no: u.mobile_no ?? '',
    belt,
    acting_belt_level,
    domain,
    date_of_joining: u.date_of_joining || null,
    manager_id: null,
  }
}

// Converts the Users UI's form shape (role labels, belt names) into the
// backend's expected PKs.
async function toApiPayload(data) {
  const [belt, acting_belt_level, groups, domain] = await Promise.all([
    beltNameToId(data.belt),
    beltNameToId(data.acting_belt_level),
    roleLabelsToGroupIds(data.roles),
    areaNameToId(data.domain),
  ])
  return {
    username: data.username,
    name: data.name,
    email: data.email,
    employee_id: data.employee_id || '',
    mobile_no: data.mobile_no || '',
    domain,
    date_of_joining: data.date_of_joining || null,
    belt,
    acting_belt_level,
    groups,
  }
}

// --- Live backend calls -----------------------------------------------------

export async function login(username, password) {
  try {
    const { data } = await client.post('/api/auth/login/', { username, password })
    setTokens({ access: data.access, refresh: data.refresh })
    return fromApiUser(data.user)
  } catch (err) {
    // DRF returns { detail: "No active account found with the given credentials" }.
    throw new Error(err.response?.data?.detail || 'Login failed. Check your username and password.')
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

// Return the authenticated user's own profile (verifies identity after reload
// against the token rather than trusting the localStorage copy).
export async function getMe() {
  const { data } = await client.get('/api/auth/me/')
  return fromApiUser(data)
}

// --- Forgot-password flow (live backend, Phase 8) ---------------------------
// There is no email backend in this build, so the request endpoint returns the
// reset link directly in DEBUG (see backend PasswordResetRequestView); the
// ForgotPassword screen surfaces it. The response is always generic so the
// endpoint never reveals whether an email is registered.

export async function requestPasswordReset(email) {
  const { data } = await client.post('/api/auth/password-reset/', { email })
  // `token` is present only in DEBUG (dev convenience); undefined otherwise.
  return data
}

export async function verifyResetToken(token) {
  try {
    const { data } = await client.get(`/api/auth/password-reset/${token}/`)
    return data.valid ? { email: data.email } : null
  } catch {
    return null
  }
}

export async function resetPasswordWithToken(token, newPassword) {
  try {
    await client.post(`/api/auth/password-reset/${token}/`, { new_password: newPassword })
  } catch (err) {
    throwApiError(err)
  }
}
