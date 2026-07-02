import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as leadTypesApi from '@/api/leadTypes'

export function useLeadTypes() {
  return useQuery({ queryKey: ['lead-types'], queryFn: leadTypesApi.listLeadTypes })
}

export function useCreateLeadType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => leadTypesApi.createLeadType(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useUpdateLeadType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => leadTypesApi.updateLeadType(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useCreateTaskStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadTypeId, data, order }) => leadTypesApi.createTaskStep(leadTypeId, data, order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useUpdateTaskStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => leadTypesApi.updateTaskStep(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useDeleteTaskStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => leadTypesApi.deleteTaskStep(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useCreateChecklistTemplateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskStepId, data, order }) => leadTypesApi.createChecklistTemplateItem(taskStepId, data, order),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useUpdateChecklistTemplateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => leadTypesApi.updateChecklistTemplateItem(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}

export function useDeleteChecklistTemplateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => leadTypesApi.deleteChecklistTemplateItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-types'] }),
  })
}
