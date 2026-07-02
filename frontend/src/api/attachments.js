import { getAll, insert, genId } from '../mocks/db'

export async function listAttachments(entityType, entityId) {
  const rows = await getAll('attachments')
  return rows.filter((a) => a.entity_type === entityType && a.entity_id === entityId)
}

// In the mock layer we can't persist real bytes, so we keep filename/metadata
// only. POST /api/attachments (§15) is multipart in the real backend.
export async function uploadAttachment({ entity_type, entity_id, file, uploaded_by }) {
  return insert('attachments', {
    id: genId('att'), entity_type, entity_id, filename: file.name,
    url: '#', uploaded_by, uploaded_at: new Date().toISOString(),
  })
}
