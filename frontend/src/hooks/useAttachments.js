import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as attachmentsApi from '@/api/attachments'

export function useAttachments(entityType, entityId) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => attachmentsApi.listAttachments(entityType, entityId),
    enabled: !!entityId,
  })
}

export function useUploadAttachment(entityType, entityId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, title }) => attachmentsApi.uploadAttachment({ entity_type: entityType, entity_id: entityId, file, title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  })
}

export function useDeleteAttachment(entityType, entityId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => attachmentsApi.deleteAttachment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', entityType, entityId] }),
  })
}
