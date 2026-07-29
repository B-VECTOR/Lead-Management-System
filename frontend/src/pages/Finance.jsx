import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Wallet, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StageBadge } from '@/components/shared/StatusBadge'
import { useFinanceGates, useDecideFinanceGate } from '@/hooks/useFinance'

// Finance Accounts queue (Phase R4, PRD §5.10). Lists the open payment-approval
// gate tasks (7, 15, 28) and lets Finance answer "Payment received against all
// invoices?" per gate: Yes closes it (the workflow proceeds; Task 28 completes
// the lead); No closes it with a mandatory remark and re-opens the preceding
// money task so the outstanding payment is chased.

function GateCard({ gate }) {
  const decide = useDecideFinanceGate()
  const [mode, setMode] = useState(null) // null | 'bounce'
  const [remark, setRemark] = useState('')
  const busy = decide.isPending

  async function submit(received) {
    if (!received && !remark.trim()) return
    try {
      const res = await decide.mutateAsync({ taskId: gate.id, received, remark: remark.trim() })
      if (received) {
        const completed = (res?.opened_tasks?.length ?? 0) === 0
        toast.success(completed ? 'Payment approved — gate closed.' : 'Payment approved — gate closed.')
      } else {
        toast.success('Recorded — the preceding task was re-opened to chase payment.')
      }
      setMode(null)
      setRemark('')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const lead = `${gate.lead_company_name} — ${gate.lead_project_name}`

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            <span className="text-muted-foreground">Task {gate.task_no}.</span> {gate.task_name}
          </CardTitle>
          <div className="flex items-center gap-2">
            {gate.stage_code && <StageBadge stage={gate.stage_code} />}
            {gate.reopened_count > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Bounced {gate.reopened_count}×
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to={`/leads/${gate.lead}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
            {/* R9-1: Accounts reconciles against the Project ID, so it leads. */}
            {gate.project_id && <span className="font-medium tabular-nums text-foreground">{gate.project_id}</span>}
            {lead} <ExternalLink className="size-3" />
          </Link>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium">Payment received against all invoices?</p>

        {mode !== 'bounce' ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => submit(true)} disabled={busy}>
              <CheckCircle2 className="size-4" /> Yes — approve &amp; close
            </Button>
            <Button variant="outline" onClick={() => setMode('bounce')} disabled={busy}>
              <RotateCcw className="size-4" /> No — payment outstanding
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`remark-${gate.id}`}>
                Remark <span className="text-red-500">*</span> — why payment is outstanding
              </Label>
              <Textarea
                id={`remark-${gate.id}`}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="e.g. Final fixed-fee invoice still unpaid by client…"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Closing with "No" re-opens the preceding task so the responsible person can chase the payment. The gate re-opens for you once they close it again.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setMode(null); setRemark('') }} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => submit(false)} disabled={busy || !remark.trim()}>
                Close &amp; re-open preceding task
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function Finance() {
  const { data: gates = [], isLoading, isError } = useFinanceGates()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Wallet className="size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Accounts — Payment Approvals</h1>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Payment-approval gates awaiting your decision (Tasks 7, 15, 28).
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading the Accounts queue…</p>}
      {isError && <p className="text-sm text-red-600">Couldn't load the Accounts queue. Please try again.</p>}
      {!isLoading && !isError && gates.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <CheckCircle2 className="size-10 text-muted-foreground/40" />
          <p className="font-medium">Nothing to approve</p>
          <p className="text-sm text-muted-foreground">No payment-approval gates are open right now.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {gates.map((gate) => (
          <GateCard key={gate.id} gate={gate} />
        ))}
      </div>
    </div>
  )
}
