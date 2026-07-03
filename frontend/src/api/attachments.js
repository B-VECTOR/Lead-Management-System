import { getAll, insert, remove, genId } from '../mocks/db'

export async function listAttachments(entityType, entityId) {
  const rows = await getAll('attachments')
  return rows.filter((a) => a.entity_type === entityType && a.entity_id === entityId)
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// The real backend (§15) stores real bytes behind a served URL from a
// multipart POST. The mock layer has no server to hand files to, so it reads
// the file into a data URL and persists that as `url` — real enough that
// view/download links actually work against locally-uploaded files.
export async function uploadAttachment({ entity_type, entity_id, file, title, uploaded_by }) {
  const url = await readFileAsDataURL(file)
  return insert('attachments', {
    id: genId('att'), entity_type, entity_id, filename: file.name, title: title || null,
    url, uploaded_by, uploaded_at: new Date().toISOString(),
  })
}

export async function deleteAttachment(id) {
  return remove('attachments', id)
}
