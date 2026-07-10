// Lead attachments, wired to the real Django REST backend (Phase 8).
//
// Files are stored as real bytes behind a served MEDIA url (multipart upload),
// replacing the old localStorage data-URL mock. Attachments are lead-scoped;
// the `entityType` argument is always 'lead' and kept only so the existing
// hook/call sites read unchanged. The 5 MB cap is enforced server-side too.
import client from './client'

export async function listAttachments(_entityType, leadId) {
  const { data } = await client.get(`/api/leads/${leadId}/attachments/`)
  return Array.isArray(data) ? data : data.results || []
}

export async function uploadAttachment({ entity_id, file, title }) {
  const form = new FormData()
  form.append('file', file)
  if (title) form.append('title', title)
  const { data } = await client.post(`/api/leads/${entity_id}/attachments/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteAttachment(id) {
  await client.delete(`/api/attachments/${id}/`)
}
