import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as companiesApi from '@/api/companies'
import { useAuth } from '@/context/AuthContext'

export function useCompanies() {
  return useQuery({ queryKey: ['companies'], queryFn: companiesApi.listCompanies })
}

export function useCompany(id) {
  return useQuery({ queryKey: ['company', id], queryFn: () => companiesApi.getCompany(id), enabled: !!id })
}

export function useCompanyContacts(companyId) {
  return useQuery({ queryKey: ['company-contacts', companyId], queryFn: () => companiesApi.getCompanyContacts(companyId), enabled: !!companyId })
}

export function useCompanyLeads(companyId) {
  return useQuery({ queryKey: ['company-leads', companyId], queryFn: () => companiesApi.getCompanyLeads(companyId), enabled: !!companyId })
}

export function useCreateCompany() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (data) => companiesApi.createCompany(data, user.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
  })
}

export function useCreateContact(companyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => companiesApi.createContact({ ...data, company_id: companyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-contacts', companyId] }),
  })
}
