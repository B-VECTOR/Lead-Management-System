import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SlotBadge, StageBadge, TaskStateBadge, slotOrder } from '@/components/shared/StatusBadge'
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
//
// 2026-07-29 (per the user): rows are **grouped by project**. One project has an
// allocation task per stage, so a flat list repeated the same Project ID and
// name 4–6 times and scattered one engagement's stages among everyone else's.
// The project is now stated once, in a header row that also names who currently
// holds which slot across the whole engagement — that's where the "Red stays,
// Brown/White change per stage" picture reads at a glance — and its stage rows
// sit underneath in workflow order.

const STATUS_FILTERS = [
  // "To do" spans pending as well as open: a trigger-gated allocation task is
  // staffable *before* its date (R12-4 — that's how auditors get allocated in
  // advance), so hiding pending rows would hide the very thing being asked for.
  { value: 'open,pending', label: 'To do' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Done' },
]

const TODO_STATUSES = ['open', 'pending', 'hold']

// The people currently holding a slot anywhere in this project, one chip per
// person+slot no matter how many of its stages they span — read off the tasks'
// own `allocation.occupants`, so it needs no extra fetch.
function currentTeam(tasks) {
  const members = new Map()
  for (const task of tasks) {
    const occupants = task.allocation?.occupants || {}
    for (const [slot, rows] of Object.entries(occupants)) {
      for (const row of rows) {
        if (row.status !== 'allocated' || !row.user || row.is_tbd) continue
        const key = `${slot}|${row.user}`
        const member = members.get(key)
        if (member) member.stages += 1
        else members.set(key, { key, slot, name: row.user_name?.name || '—', stages: 1 })
      }
    }
  }
  return [...members.values()].sort(
    (a, b) => slotOrder(a.slot) - slotOrder(b.slot) || a.name.localeCompare(b.name),
  )
}

// Group the flat task list by lead (= one project/engagement). Groups keep the
// list's newest-first ordering (by highest task id) so a freshly opened
// allocation stays at the top; tasks *inside* a group run in workflow order,
// which is the order they get staffed in.
function groupByProject(tasks) {
  const groups = new Map()
  for (const task of tasks) {
    let group = groups.get(task.lead)
    if (!group) {
      group = {
        lead: task.lead,
        projectId: task.project_id,
        projectName: task.lead_project_name,
        companyName: task.lead_company_name,
        tasks: [],
      }
      groups.set(task.lead, group)
    }
    if (!group.projectId && task.project_id) group.projectId = task.project_id
    group.tasks.push(task)
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.tasks.sort((a, b) => (a.task_no ?? 0) - (b.task_no ?? 0) || a.id - b.id)
    group.latestId = Math.max(...group.tasks.map((t) => t.id))
    group.todoCount = group.tasks.filter((t) => TODO_STATUSES.includes(t.status)).length
    group.team = currentTeam(group.tasks)
  }
  return list.sort((a, b) => b.latestId - a.latestId)
}

// A project header: the engagement stated once, plus its live slot holders.
function ProjectHeaderRow({ group }) {
  return (
    <TableRow className="bg-muted/60 hover:bg-muted/60">
      <TableCell colSpan={6} className="py-2.5 whitespace-normal">
        <div className="sticky left-0 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium tabular-nums">
              {group.projectId || <span className="font-normal text-muted-foreground">Project ID pending</span>}
            </span>
            {/* R13-1: the other way into the same allocation — the lead's task
                stepper. Read-only for the role apart from its allocation steps. */}
            <Link to={`/leads/${group.lead}`} className="text-sm font-medium hover:underline">
              {group.projectName}
            </Link>
            <span className="text-xs text-muted-foreground">{group.companyName}</span>
            <span className="text-xs text-muted-foreground">
              {group.tasks.length} allocation {group.tasks.length === 1 ? 'step' : 'steps'}
              {group.todoCount > 0 && ` · ${group.todoCount} to do`}
            </span>
          </div>
          {group.team.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {group.team.map((member) => (
                <span
                  key={member.key}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5"
                  title={member.stages > 1 ? `Holds this slot in ${member.stages} stages` : undefined}
                >
                  <SlotBadge slot={member.slot} />
                  <span className="text-xs font-medium">{member.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

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
        <TableCell className="whitespace-nowrap"><StageBadge stage={task.stage_code} /></TableCell>
        <TableCell className="max-w-[240px] whitespace-normal">
          {task.task_name}
          {task.is_hanging_task && <span className="ml-1.5 text-xs text-muted-foreground">(non-blocking)</span>}
          {task.status === 'pending' && opensOn && (
            <div className="text-xs text-muted-foreground">Opens {formatDate(opensOn)}</div>
          )}
        </TableCell>
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
            <span>{summary?.text || <span className="text-muted-foreground">Not assigned yet</span>}</span>
          </div>
        </TableCell>
        <TableCell className="text-right">
          {/* The row is the primary affordance now; this stays as the label for
              what opening does (assign vs. read-only view). "Assign" rather than
              the internal "Staff" wording, per the user. */}
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onToggle() }}>
            {expanded ? 'Close' : task.can_staff ? 'Assign' : 'View'}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          {/* `whitespace-normal` undoes the table default — the panel's help text
              must wrap, or it alone forces the table wider than the screen. */}
          <TableCell colSpan={6} className="p-0 whitespace-normal">
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
  const groups = useMemo(() => groupByProject(tasks), [tasks])

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
            Your resource-allocation tasks, grouped by project — one project has a step per stage,
            and each header shows who currently holds which slot across the engagement. Open a step
            to assign its slots right here; submitting it opens the next task in that lead’s flow. A
            step that isn’t due yet can be assigned in advance.
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
                <TableHead>Stage</TableHead>
                <TableHead>Allocation task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slots (allocated/required)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && groups.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nothing here right now.</TableCell></TableRow>
              )}
              {groups.map((group) => (
                <Fragment key={group.lead}>
                  <ProjectHeaderRow group={group} />
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      expanded={expandedId === task.id}
                      panelWidth={panelWidth}
                      onToggle={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                    />
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
