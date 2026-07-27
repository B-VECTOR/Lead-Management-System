import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as financeApi from '@/api/finance'

// Finance Accounts-queue hooks (Phase R4). The queue lists open payment-approval
// gate tasks; a decision closes the gate (and may bounce the preceding task).

export function useFinanceGates() {
  return useQuery({
    queryKey: ['finance-gates'],
    queryFn: financeApi.listFinanceGates,
  })
}

export function useDecideFinanceGate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, received, remark }) =>
      financeApi.decideFinanceGate(taskId, { received, remark }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-gates'] })
      // A decision can re-open/close tasks and complete a lead — refresh the
      // lead-facing caches so the stepper/list/dashboard stay in sync.
      qc.invalidateQueries({ queryKey: ['lead-tasks'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
