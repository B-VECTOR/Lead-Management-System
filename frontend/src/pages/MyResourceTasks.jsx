import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { slotSummary } from '@/components/resources/AllocationSlots'
import { AllocationPanel } from '@/components/resources/AllocationPanel'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAllocationTasks } from '@/hooks/useResources'

// "My Tasks (Resource)" (R9, D-R9-3) — the Resource Manager's allocation queue.
// The backend list is already role-scoped: a Resource Manager sees every
// allocation task across every lead; a Default BD Person (D12) sees only their
// own leads'. This is a resource-module-only list — not a general per-user "My
// Tasks", which the app deliberately does not have (Tech Req §6).
//
// R12-1: a row **expands in place** into the shared `AllocationPanel`, so the
// whole job can be done here. R13-1 puts the Leads tab back for the role as a
// *second* way in (per the user: assign resources "from lead too and from
// resource tab too") — the row's project name links to the lead, whose task
// stepper renders the same panel. Neither surface is the canonical one.
//
// R13-2 (usability): the row itself toggles, with a leading chevron, because the
// right-hand Staff button sat off-screen whenever the table scrolled sideways.
// The expanded panel is pinned to the left of the scroll viewport and sized to
// it (`panelWidth`), so its fields never inherit the table's full scroll width.

const STATUS_FILTERS = [
  // "To do" spans pending as well as open: a trigger-gated allocation task is
  // staffable *before* its date (R12-4 — that's how auditors get allocated in
  // advance), so hiding pending rows would hide the very thing being asked for.
  { value: 'open,pending', label: 'To do' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Done' },
]

function TaskRow({ task, expanded, onToggle, panelWidth }) {
  const summary = slotSummary(task)
  const opensOn = task.scheduled_open?.open_date

  return (
    <>
      <TableRow
        className={cn('cursor-pointer', expanded && 'border-b-0 bg-muted/40')}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <TableCell className="w-8 pr-0">
          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        </TableCell>
        {/* R9-1: the Project ID identifies the engagement; the names are context. */}
        <TableCell className="font-medium tabular-nums">
          {task.project_id || <span className="font-normal text-muted-foreground">Pending</span>}
        </TableCell>
        <TableCell className="max-w-[220px] whitespace-normal">
          {/* R13-1: the other way into the same allocation — the lead's task
              stepper. Read-only for the role apart from its allocation steps. */}
          <Link
            to={`/leads/${task.lead}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {task.lead_project_name}
          </Link>
          <div className="text-xs text-muted-foreground">{task.lead_company_name}</div>
        </TableCell>
        <TableCell className="max-w-[200px] whitespace-normal">
          {task.task_name}
          {task.is_hanging_task && <span className="ml-1.5 text-xs text-muted-foreground">(non-blocking)</span>}
          {task.status === 'pending' && opensOn && (
            <div className="text-xs text-muted-foreground">Opens {formatDate(opensOn)}</div>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell"><StageBadge stage={task.stage_code} /></TableCell>
        <TableCell><TaskStateBadge status={task.status} /></TableCell>
        <TableCell className="max-w-[260px] whitespace-normal">
          <div className="flex items-start gap-1.5">
            {summary?.over && (
              <Tooltip>
                <TooltipTrigger asChild><AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" /></TooltipTrigger>
                <TooltipContent>Over-allocated: more resources than required</TooltipContent>
              </Tooltip>
            )}
            {!summary?.over && summary?.under && (
              <Tooltip>
                <TooltipTrigger asChild><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" /></TooltipTrigger>
                <TooltipContent>Under-allocated: fewer resources than required</TooltipContent>
              </Tooltip>
            )}
            <span>{summary?.text || <span className="text-muted-foreground">Not staffed yet</span>}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {/* The row is the primary affordance now; this stays as the label for
              what opening does (staff vs. read-only view). */}
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onToggle() }}>
            {expanded ? 'Close' : task.can_staff ? 'Staff' : 'View'}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          {/* `whitespace-normal` undoes the table default — the panel's help text
              must wrap, or it alone forces the table wider than the screen. */}
          <TableCell colSpan={8} className="p-0 whitespace-normal">
            {/* Pinned to the viewport's left edge and sized to it, so the panel's
                selects stay a readable length instead of stretching to the
                table's scroll width — and stay put if the table is scrolled. */}
            <div
              className="sticky left-0 p-3 sm:p-4"
              style={panelWidth ? { width: `${panelWidth}px` } : undefined}
            >
              <AllocationPanel task={task} />
            </div>
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

  // Width of the table's visible area — the expanded panel is sized to this so
  // it never inherits the (wider) scrollable table width.
  const viewportRef = useRef(null)
  const [panelWidth, setPanelWidth] = useState(null)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setPanelWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
        <CardContent ref={viewportRef} className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Project ID</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Allocation task</TableHead>
                <TableHead className="hidden md:table-cell">Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slots (allocated/required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && sorted.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nothing here right now.</TableCell></TableRow>
              )}
              {sorted.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  expanded={expandedId === task.id}
                  panelWidth={panelWidth}
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
