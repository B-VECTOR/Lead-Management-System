import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { slotSummary } from '@/components/resources/AllocationSlots'
import { useAllocationTasks } from '@/hooks/useResources'

// "My Tasks (Resource)" (R9, D-R9-3) — the Resource Manager's allocation queue
// presented as a task list. Each row opens the task in the lead's stepper, where
// the slots are now staffed inline (R9) rather than in the old popup. The
// backend list is already role-scoped: a Resource Manager sees every allocation
// task across every lead; a Default BD Person (D12) sees only their own leads'.
// This is a resource-module-only list — not a general per-user "My Tasks", which
// the app deliberately does not have (Tech Req §6).

const STATUS_FILTERS = [
  { value: 'open', label: 'To do' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Done' },
]

function TaskRow({ task }) {
  const summary = slotSummary(task)
  const workable = ['open', 'pending'].includes(task.status)
  return (
    <TableRow>
      {/* R9-1: the Project ID identifies the engagement; the names are context. */}
      <TableCell className="font-medium tabular-nums">
        {task.project_id || <span className="font-normal text-muted-foreground">Pending</span>}
      </TableCell>
      <TableCell>
        <div className="font-medium">{task.lead_project_name}</div>
        <div className="text-xs text-muted-foreground">{task.lead_company_name}</div>
      </TableCell>
      <TableCell>
        {task.task_name}
        {task.is_hanging_task && <span className="ml-1.5 text-xs text-muted-foreground">(non-blocking)</span>}
      </TableCell>
      <TableCell><StageBadge stage={task.stage_code} /></TableCell>
      <TableCell><TaskStateBadge status={task.status} /></TableCell>
      <TableCell>{summary?.text || <span className="text-muted-foreground">Not staffed yet</span>}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {summary?.over && (
            <Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="size-4 text-red-600" /></TooltipTrigger>
              <TooltipContent>Over-allocated: more resources than required</TooltipContent>
            </Tooltip>
          )}
          {!summary?.over && summary?.under && (
            <Tooltip>
              <TooltipTrigger asChild><AlertTriangle className="size-4 text-amber-500" /></TooltipTrigger>
              <TooltipContent>Under-allocated: fewer resources than required</TooltipContent>
            </Tooltip>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to={`/leads/${task.lead}`}>
              {workable ? 'Staff task' : 'View'} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function MyResourceTasks() {
  const [statusFilter, setStatusFilter] = useState('open')
  const { data: tasks = [], isLoading } = useAllocationTasks(
    statusFilter === 'all' ? {} : { status: statusFilter },
  )
  const sorted = useMemo(() => [...tasks].sort((a, b) => b.id - a.id), [tasks])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Tasks — Resource</h1>
          <p className="text-sm text-muted-foreground">
            Your resource-allocation tasks across every lead. Open one to staff its slots
            inline; submitting it opens the next task in that lead’s flow.
          </p>
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project ID</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Allocation task</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slots (allocated/required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nothing here right now.</TableCell></TableRow>
              )}
              {sorted.map((task) => <TaskRow key={task.id} task={task} />)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
