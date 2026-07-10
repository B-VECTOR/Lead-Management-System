// Leads-funnel dashboard, wired to the real Django REST backend (Phase 8).
//
// Aggregation happens server-side (`/api/dashboard/`), scoped own-vs-all per
// role (PRD §6): a Lead Admin's funnel spans every lead, a Lead Manager's /
// Marketing's their own. Users with no lead scope get an empty funnel and rely
// on the overdue-follow-up list, which is always their own.
import client from './client'

export async function getDashboardSummary() {
  const { data } = await client.get('/api/dashboard/')
  return data
}
