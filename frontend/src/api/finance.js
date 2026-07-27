// Finance Accounts queue, wired to the Django backend (Phase R4, §5.10).
//
// Finance owns the three payment-approval gate tasks (7, 15, 28). Each asks
// "Payment received against all invoices?" — Yes closes the gate (the workflow
// proceeds; Task 28 completes the lead), No closes it with a mandatory remark
// and re-opens the preceding money task so it is chased. Working a gate reuses
// the standard task endpoints, so this module leans on `api/tasks.js`.
import client from './client'
import { saveTaskDraft, completeTask } from './tasks'

// The open gate tasks awaiting a Finance decision (the Accounts queue).
export async function listFinanceGates() {
  const { data } = await client.get('/api/finance-gates/')
  return Array.isArray(data) ? data : data.results || []
}

// Record a gate decision: persist the answer (+ remark on a "No"), then close
// the gate. A "Yes" proceeds/completes; a "No" bounces the preceding task back
// open. Returns the complete response ({ task, opened_tasks }).
export async function decideFinanceGate(taskId, { received, remark = '' }) {
  await saveTaskDraft(taskId, {
    payment_received: received ? 'Yes' : 'No',
    remark: received ? '' : remark,
  })
  return completeTask(taskId)
}
