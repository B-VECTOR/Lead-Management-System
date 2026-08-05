// Role dashboards, wired to the real Django REST backend (Phase 8, rebuilt in
// R20).
//
// One endpoint per module, each gated server-side by that module's own
// permission class (PLAN.md DD-R20-1): the leads endpoint is open to any
// authenticated user and self-scopes (a Lead Admin's numbers span every lead, a
// Lead Manager's their own — PRD §6); the resource/finance/user ones 403 for
// anyone outside the role. The module tabs mirror the same role helpers the nav
// uses, so a 403 here means the UI and the backend have drifted — the fetchers
// deliberately do **not** swallow it.
import client from './client'

export async function getDashboardSummary() {
  const { data } = await client.get('/api/dashboard/')
  return data
}

export async function getResourceDashboard() {
  const { data } = await client.get('/api/dashboard/resources/')
  return data
}

export async function getFinanceDashboard() {
  const { data } = await client.get('/api/dashboard/finance/')
  return data
}

export async function getUserDashboard() {
  const { data } = await client.get('/api/dashboard/users/')
  return data
}
