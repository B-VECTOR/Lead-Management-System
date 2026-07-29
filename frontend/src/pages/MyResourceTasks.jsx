import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { slotSummary } from '@/components/resources/AllocationSlots'
import { AllocationPanel } from '@/components/resources/AllocationPanel'
import { formatDate } from '@/lib/format'
import { useAllocationTasks } from '@/hooks/useResources'

// "My Tasks (Resource)" (R9, D-R9-3) — the Resource Manager's allocation queue.
// The backend list is already role-scoped: a Resource Manager sees every
// allocation task across every lead; a Default BD Person (D12) sees only their
// own leads'. This is a resource-module-only list — not a general per-user "My
// Tasks", which the app deliberately does not have (Tech Req §6).
//
// R12-1: a row now **expands in place** into the shared `AllocationPanel`, so the
// whole job is done here. It used to link out to the lead's task stepper, which
// is why the role had the Leads tab at all (R10-1) — that tab is gone again.

const STATUS_FILTERS = [
  // "To do" spans pending as well as open: a trigger-gated allocation task is
  // staffable *before* its date (R12-4 — that's how auditors get allocated in
  // advance), so hiding pending rows would hide the very thing being asked for.
  { value: 'open,pending', label: 'To do' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Done' },
]

function TaskRow({ task, expanded, onToggle }) {
  const summary = slotSummary(task)
  const opensOn = task.scheduled_open?.open_date
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <>
      <TableRow className={expanded ? 'border-b-0 bg-muted/40' : undefined}>
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
          {task.status === 'pending' && opensOn && (
            <div className="text-xs text-muted-foreground">Opens {formatDate(opensOn)}</div>
          )}
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
            <Button size="sm" variant="outline" onClick={onToggle}>
              <Chevron className="size-4" />
              {expanded ? 'Close' : task.can_staff ? 'Staff' : 'View'}
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={7} className="p-3 sm:p-4">
            <AllocationPanel task={task} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function MyResourceTasks() {
  const [statusFilter, setStatusFilter] = useState('open,pending')
  const [expandedId, setExpandedId] = useState(null)
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
            right here; submitting it opens the next task in that lead’s flow. A task that
            isn’t due yet can be staffed in advance.
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
              {sorted.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedId === task.id}
                  onToggle={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
