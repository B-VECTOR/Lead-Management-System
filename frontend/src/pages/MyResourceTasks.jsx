import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AllocationHealthBadge, StageBadge, TaskStateBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ExtraSlotsGrid,
  SlotCell,
  WhiteCell,
  filledSlotCount,
  isSubmittable,
  useAllocationActions,
} from '@/components/resources/AllocationCells'
import { ShortCloseButton } from '@/components/leads/ShortCloseButton'
import { allocationHealth, isCoreAuditorSlot, isStepDue } from '@/lib/allocation'
import { formatDate } from '@/lib/format'
import { useAllocationTasks, useSubmitAllocationTask } from '@/hooks/useResources'

// "My Tasks (Resource)" (R9, D-R9-3) — the Resource Manager's allocation queue.
// The backend list is already role-scoped: a Resource Manager sees every
// allocation task across every lead; a Default BD Person (D12) sees only their
// own leads'. This is a resource-module-only list — not a general per-user "My
// Tasks", which the app deliberately does not have (Tech Req §6).
//
// R22 (2026-08-05, per the user — the people working this screen are 40+/50+ and
// want "table like structure like project closure … see the table, get the
// information quick and take action there itself"): the screen is now a **flat
// table with a column per role**, the same shape as `pages/ProjectClosure.jsx`
// (Exec Red / Exec Brown / White(s)) — except each of those cells is *editable
// in place*. The name is the cell, and the cell is the people-picker.
//
// What that replaced: a "Slots (allocated/required)" column showing counts
// (`Exec Red 1/1 · Exec Brown 0/1`), so "who is the Brown here?" cost a click to
// expand the row into `AllocationPanel`'s vertical card of labelled selects, one
// row at a time. The controls themselves live in `AllocationCells.jsx`; the old
// form layout stays in `AllocationSlots.jsx`, which the lead's task stepper
// (`LeadTaskTab.AllocationStep`) still uses — R13-1's second way in, for a lead's
// Default BD Person. Neither surface is the canonical one.
//
// Rows are grouped by project: one project has an allocation task per stage, so
// a flat list would repeat the same Project ID and name 4–6 times and scatter one
// engagement's stages among everyone else's. The project is stated once, in a
// plain header row (Project Closure's `bg-muted/40` style) whose contents stay
// `sticky left-0` so it survives the sideways scroll a 9-column table needs.

const STATUS_FILTERS = [
  // "To do" spans pending as well as open: a trigger-gated allocation task is
  // staffable *before* its date (R12-4 — that's how auditors get allocated in
  // advance), so hiding pending rows would hide the very thing being asked for.
  { value: 'open,pending', label: 'To do' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Done' },
]

const TODO_STATUSES = ['open', 'pending', 'hold']
const IN_PLAY_STATUSES = ['open', 'pending', 'hold']
const FROZEN_STATUSES = ['skipped', 'dropped']

// Auditors 1–2 are the mandatory pair and share one column (DD-R22-1); Auditors
// 3–4 and the ten Project Members are optional extras, kept out of the main
// columns and reachable from the row's "Team & extras" toggle.
//
// R24 (per the user, 2026-08-05: "audit will generally come at last not early so
// add all the audit and project members under team and extra and when the actual
// task where audit is required you can put it outside"): while the audit step is
// still `pending` — which, for audit, is most of a project's life — Auditors 1–2
// join those extras too. They stay fully staffable there (that is how auditors
// get allocated in advance, R12-4); what they stop doing is occupying a main
// column and reporting a shortage nobody can act on yet. Once the step opens,
// `isStepDue` promotes them back into the Auditors column. Which slots those are
// comes from `lib/allocation.js` (`isCoreAuditorSlot`), the same module that
// decides when they count — the two must not drift.
// Project ID | Stage | Step | Status | Red | Brown | White(s) | Auditors |
// Manpower | Action — the Manpower column added in R23-3c.
const COLUMN_COUNT = 10

function isExtraSlot(slot) {
  return slot.startsWith('project_member_') || slot === 'auditor_3' || slot === 'auditor_4'
}

// Wording for the Manpower tooltip's per-slot lines (R24-7).
const WAITING_NOTE = {
  manpower: 'not counted yet — the manpower request for this stage hasn’t been submitted',
  not_due: 'not counted yet — this step isn’t due',
  carry_over: 'carries over from the previous stage when this step opens',
}
const SLOT_VERDICT = { over: ' — over', under: ' — short', red: ' — mandatory' }

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
        projectName: task.lead_project_name,
        companyName: task.lead_company_name,
        tasks: [],
      }
      groups.set(task.lead, group)
    }
    group.tasks.push(task)
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.tasks.sort((a, b) => (a.task_no ?? 0) - (b.task_no ?? 0) || a.id - b.id)
    group.latestId = Math.max(...group.tasks.map((t) => t.id))
    group.todoCount = group.tasks.filter((t) => TODO_STATUSES.includes(t.status)).length
    // Lead-level, so every task in the group carries the same value — any one
    // of them answers it (`some` rather than `[0]` only to tolerate an older
    // cached payload that predates the field).
    group.canShortClose = group.tasks.some((t) => t.lead_can_short_close)
  }
  return list.sort((a, b) => b.latestId - a.latestId)
}

// A project header: the engagement stated once. It no longer repeats the team as
// chips — the names are in the row cells below it now, which is the whole point
// of R22.
function ProjectHeaderRow({ group }) {
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={COLUMN_COUNT} className="py-2 whitespace-normal">
        <div className="sticky left-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={`/leads/${group.lead}`} className="font-medium hover:underline">
            {group.projectName}
          </Link>
          <span className="text-sm text-muted-foreground">{group.companyName}</span>
          <span className="text-xs text-muted-foreground">
            {group.tasks.length} allocation {group.tasks.length === 1 ? 'step' : 'steps'}
            {group.todoCount > 0 && ` · ${group.todoCount} to do`}
          </span>
          {/* Short-close (user, 2026-07-30): the same control as Lead Detail's
              header, offered here so the role never has to leave its module.
              Renders nothing unless the action is currently available on this
              lead — `lead_can_short_close`, read off the group's tasks. */}
          <ShortCloseButton
            leadId={group.lead}
            canShortClose={group.canShortClose}
            size="sm"
            className="ml-auto text-blue-600 hover:text-blue-700"
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

// Auditors 1–2 in one column. Only the auditor-allocation step (Task 18) staffs
// them, so on every other row this cell is a dash and the labels never appear —
// and on that step, only once it is due (R24); until then the cell points at the
// extras row that holds the pickers.
function AuditorsCell({ task, actions, disabled, slots }) {
  const alloc = task.allocation || {}
  if (slots.length === 0) {
    const deferred = (alloc.slots || []).some(isCoreAuditorSlot)
    return deferred ? (
      <span
        className="text-xs text-muted-foreground"
        title="Audit comes at the end of the project. The auditor pickers are in this row’s “Team & extras” — assign them any time; they aren’t counted until this step is due."
      >
        Not due — in Team &amp; extras
      </span>
    ) : (
      <span className="text-muted-foreground" title="This step does not staff auditors">
        —
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {slots.map((slot) => (
        <div key={slot} className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{alloc.slot_labels?.[slot] || slot}</span>
          <SlotCell task={task} slot={slot} actions={actions} disabled={disabled} />
        </div>
      ))}
    </div>
  )
}

// The Status cell. `AllocationPanel`'s three explanatory paragraphs have no room
// in a table row, so what each state means is a tooltip on the badge instead
// (R22-6): staffable-in-advance for `pending`, still-changeable for `closed`.
function StatusCell({ task, staffable }) {
  const opensOn = task.scheduled_open?.open_date
  const hint = task.status === 'pending' && staffable
    ? task.auto_closes_when_staffed
      ? 'Not due yet — you can assign it now, and with the required slots filled it completes itself when it opens.'
      : 'Not due yet — you can assign it now, and the step opens already assigned.'
    : task.status === 'closed' && staffable
      ? 'Already submitted — the allocation stays live until these resources are released, so you can still change who holds a slot. Open tasks driven by an Execution Red move with it.'
      : null

  return (
    <div className="flex flex-col gap-0.5">
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-fit cursor-help border-b border-dotted border-muted-foreground/50">
              <TaskStateBadge status={task.status} />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{hint}</TooltipContent>
        </Tooltip>
      ) : (
        <TaskStateBadge status={task.status} />
      )}
      {task.status === 'pending' && opensOn && (
        <span className="text-xs text-muted-foreground">Opens {formatDate(opensOn)}</span>
      )}
    </div>
  )
}

function TaskRow({ task, actions, onSubmit, submitting, expanded, onToggleExtras, panelWidth }) {
  const alloc = task.allocation || {}
  const frozen = FROZEN_STATUSES.includes(task.status)
  const staffable = !!task.can_staff && !frozen
  const disabled = !staffable
  const inPlay = IN_PLAY_STATUSES.includes(task.status)
  // R24: the auditor pair is a main column only once the audit step is due;
  // before that it belongs to the extras row, alongside Auditors 3–4 and the
  // Project Members.
  const stepDue = isStepDue(task)
  const auditorSlots = stepDue ? (alloc.slots || []).filter(isCoreAuditorSlot) : []
  const extraSlots = (alloc.slots || []).filter(
    (s) => isExtraSlot(s) || (!stepDue && isCoreAuditorSlot(s)),
  )
  const deferredAuditors = extraSlots.some(isCoreAuditorSlot)
  const submittable = isSubmittable(task)
  const health = allocationHealth(task)

  return (
    <>
      <TableRow>
        {/* `tabular-nums` at body size rather than Project Closure's `font-mono
            text-xs`: same alignment, legible for this screen's users. */}
        <TableCell className="align-top font-medium tabular-nums">
          {task.project_id || <span className="font-normal text-muted-foreground">Pending</span>}
        </TableCell>
        <TableCell className="align-top">
          <StageBadge stage={task.stage_code} />
        </TableCell>
        <TableCell className="max-w-[170px] align-top whitespace-normal">
          {task.task_name}
          {task.is_hanging_task && (
            <span className="ml-1.5 text-xs text-muted-foreground">(non-blocking)</span>
          )}
        </TableCell>
        <TableCell className="align-top">
          <StatusCell task={task} staffable={staffable} />
        </TableCell>
        <TableCell className="align-top">
          <SlotCell task={task} slot="execution_red" actions={actions} disabled={disabled} />
        </TableCell>
        <TableCell className="align-top">
          <SlotCell task={task} slot="execution_brown" actions={actions} disabled={disabled} />
        </TableCell>
        <TableCell className="align-top">
          <WhiteCell task={task} actions={actions} disabled={disabled} />
        </TableCell>
        <TableCell className="align-top">
          <AuditorsCell task={task} actions={actions} disabled={disabled} slots={auditorSlots} />
        </TableCell>
        {/* R23-3c — the over/under-allocation indicator Tech Req §4.7 has always
            specified and no screen ever showed. The badge is the verdict; the
            tooltip is the per-slot arithmetic behind it. */}
        <TableCell className="align-top">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help">
                <AllocationHealthBadge health={health} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {health.status === 'none' ? (
                'This step staffs no manpower-counted slot.'
              ) : (
                <span className="flex flex-col gap-0.5">
                  <span>Against the manpower approved upstream:</span>
                  {/* R24-7: the unmeasured slots are listed too, each with its
                      reason — the user asked to keep this breakdown, and "why
                      isn't this counted?" has to be answerable in it. */}
                  {health.slots.map((s) => (
                    <span key={s.slot}>
                      {s.label}: {s.allocated}
                      {s.status === 'waiting'
                        ? `${s.required > 0 ? ` of ${s.required}` : ''} — ${WAITING_NOTE[s.waiting]}`
                        : ` of ${s.required}${SLOT_VERDICT[s.status] || ''}`}
                    </span>
                  ))}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="align-top text-right">
          <div className="flex flex-col items-end gap-1">
            {staffable && inPlay && (
              <Tooltip>
                {/* The trigger is the wrapping span, not the button: a disabled
                    button fires no pointer events, and "why can't I submit?" is
                    exactly the case this tooltip has to answer. */}
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      size="sm"
                      onClick={() => onSubmit(task.id)}
                      disabled={submitting || !submittable}
                    >
                      <CheckCircle2 className="size-4" />
                      {submitting ? 'Submitting…' : 'Submit'}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {submittable
                    ? 'Confirm this allocation — it opens the next task in the lead’s flow.'
                    : 'Assign an Execution Red first — the next task is assigned to them.'}
                </TooltipContent>
              </Tooltip>
            )}
            {!staffable && (
              <span className="text-xs text-muted-foreground">
                {frozen ? 'Closed to changes' : 'View only'}
              </span>
            )}
            {extraSlots.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                aria-expanded={expanded}
                onClick={onToggleExtras}
              >
                {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                Team &amp; extras ({filledSlotCount(task, extraSlots)} of {extraSlots.length})
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {expanded && extraSlots.length > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={COLUMN_COUNT} className="p-0 whitespace-normal">
            {/* Pinned to the viewport's left edge and sized to it, so the grid's
                pickers stay a readable length instead of stretching to the
                table's scroll width — and stay put if the table is scrolled. */}
            <div
              className="sticky left-0 flex flex-col gap-2 p-3"
              style={panelWidth ? { width: `${panelWidth}px` } : undefined}
            >
              {/* R24: with the auditor pair parked here the old blanket
                  "optional · Resource Manager only" was wrong on both counts —
                  Auditors 1–2 are mandatory to submit, and every viewer of this
                  queue can see them. */}
              <p className="text-xs text-muted-foreground">
                {deferredAuditors ? (
                  <>
                    <strong className="font-medium">Auditors 1–2</strong> are mandatory for this step
                    but it isn’t due yet — assign them now if you like, nothing is counted as short
                    until it opens. The rest are optional named slots, Resource Manager only.
                  </>
                ) : (
                  <>
                    Optional named slots — Resource Manager only. The White pool above counts the
                    manpower; these name the individuals alongside it.
                  </>
                )}
              </p>
              <ExtraSlotsGrid
                task={task}
                slots={extraSlots}
                actions={actions}
                disabled={disabled}
              />
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
  const actions = useAllocationActions()

  const submit = useSubmitAllocationTask()
  const [submittingId, setSubmittingId] = useState(null)
  async function handleSubmit(taskId) {
    setSubmittingId(taskId)
    try {
      await submit.mutateAsync({ taskId })
      toast.success('Resources allocated — next task opened')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSubmittingId(null)
    }
  }

  // Width of the table's visible area — the extras row is sized to this so it
  // never inherits the (wider) scrollable table width.
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
          <p className="max-w-3xl text-sm text-muted-foreground">
            One row per allocation step, grouped by project. Pick a name in any column to assign it —
            each change saves straight away. Then press <strong>Submit</strong> to confirm the step
            and open the next task. A step that isn’t due yet can be assigned in advance.
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
                <TableHead>Project ID</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Allocation step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Execution Red</TableHead>
                <TableHead>Execution Brown</TableHead>
                <TableHead>White(s)</TableHead>
                <TableHead>Auditors</TableHead>
                <TableHead>Manpower</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-muted-foreground">
                    Nothing here right now.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((group) => (
                <Fragment key={group.lead}>
                  <ProjectHeaderRow group={group} />
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      actions={actions}
                      onSubmit={handleSubmit}
                      submitting={submittingId === task.id}
                      expanded={expandedId === task.id}
                      onToggleExtras={() =>
                        setExpandedId((id) => (id === task.id ? null : task.id))
                      }
                      panelWidth={panelWidth}
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
