import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PlayCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useHeldTasks, useUnholdTask } from '@/hooks/useHolds'

// "Held Tasks" menu (Tech Req §6 / PRD §5.8; Phase 13) — every task currently on
// hold that the signed-in user can see. The assignee (or Lead Admin) resumes it
// via Unhold; a Lead Manager who isn't the assignee gets a read-only view of the
// hold reason and the full hold→unhold trail instead of an action.
function openHoldOf(task) {
  return (task.holds || []).find((h) => !h.unhold_at) || (task.holds || [])[0] || null
}

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

function HoldTrail({ holds }) {
  if (!holds || holds.length === 0) {
    return <p className="text-sm text-muted-foreground">No hold history recorded.</p>
  }
  return (
    <ol className="flex flex-col gap-2">
      {holds.map((h) => (
        <li key={h.id} className="rounded-md border bg-background p-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>Held {fmt(h.hold_at)}{h.hold_by_name ? ` by ${h.hold_by_name}` : ''}</span>
            <span>·</span>
            <span>{h.unhold_at ? `Resumed ${fmt(h.unhold_at)}${h.unhold_by_name ? ` by ${h.unhold_by_name}` : ''}` : 'Still on hold'}</span>
          </div>
          <p className="mt-1">{h.reason ? h.reason : <span className="text-muted-foreground italic">No reason given</span>}</p>
        </li>
      ))}
    </ol>
  )
}

export default function HeldTasks() {
  const navigate = useNavigate()
  const { data: tasks = [], isLoading } = useHeldTasks()
  const unhold = useUnholdTask()
  const [expanded, setExpanded] = useState(null)
  const columnCount = 6

  function handleUnhold(task) {
    unhold.mutate(
      { taskId: task.id, leadId: task.lead },
      {
        onSuccess: () => toast.success('Task resumed'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Held Tasks</h1>
        <p className="text-sm text-muted-foreground">Tasks currently on hold. A held task cannot be edited until it is resumed. Expand a row to see the full hold history.</p>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Task</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && tasks.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No tasks are on hold.</TableCell></TableRow>
              )}
              {tasks.map((task) => {
                const hold = openHoldOf(task)
                const isOpen = expanded === task.id
                return (
                  <Fragment key={task.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : task.id)}>
                      <TableCell className="align-top">
                        {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/leads/${task.lead}`) }}>
                          <span className="text-muted-foreground">Task {task.task_no}.</span> {task.task_name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{task.lead_project_name}</span>
                        <span className="text-muted-foreground"> · {task.lead_company_name}</span>
                      </TableCell>
                      <TableCell className="text-sm">{task.assigned_to_name || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                      <TableCell className="max-w-xs text-sm">
                        {hold?.reason ? <span className="line-clamp-2">{hold.reason}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {task.can_hold ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={unhold.isPending}
                            onClick={(e) => { e.stopPropagation(); handleUnhold(task) }}
                          >
                            <PlayCircle className="size-4" /> Unhold
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={columnCount - 1} className="py-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Hold history</p>
                          <HoldTrail holds={task.holds} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
