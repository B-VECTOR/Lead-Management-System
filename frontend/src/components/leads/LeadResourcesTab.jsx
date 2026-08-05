import { useMemo, useState } from 'react'
import { CornerDownRight, Eye, EyeOff, LayoutList, Rows3, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AllocationStatusBadge,
  SlotBadge,
  StageBadge,
  slotOrder,
  slotShortLabel,
  stageLabel,
} from '@/components/shared/StatusBadge'
import { isExtendedSlot, slotHealth } from '@/lib/allocation'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLeadResourceAllocations } from '@/hooks/useResources'

const STATUS_TOOLTIP = { allocated: 'Currently occupying the slot', released: 'Freed / released' }

// Read-only view of this lead's resource allocations (§4.7, R5 rebuild).
// Allocations are staffed by the Resource Manager or the lead's Default BD
// Person on the Resources screen (Tech Req §7 / PRD §5.7); this lead-scoped
// endpoint lets the lead's own people (assignee/creator/LM/admin) see them in
// context, read-only.
//
// One project runs through several stages and each allocation task staffs that
// stage's slots, so the raw rows repeat the same person once per stage — an
// Execution Red typically runs the whole engagement while Browns/Whites come
// and go with what each stage needs. A flat table made that repetition read as
// six unrelated allocations, so the tab now offers three readings of the same
// rows (per the user, 2026-07-29):
//
//  - **By stage** (default): the slots of each stage in workflow order, with a
//    carry-over marker so a Red that simply continues is visibly not a new
//    allocation.
//  - **By resource**: a person × stage matrix — one row per person, so a
//    constant Red shows as an unbroken run and stage-specific Whites as gaps.
//  - **History**: the full append-only row list (the previous behaviour), which
//    stays the audit trail — every row, including released ones.
//
// Released holders are hidden by default in the first two views (a closed
// project would otherwise be a wall of struck-through names) and shown dashed,
// in the slot's own colour, when toggled on.

const VIEWS = [
  { value: 'stage', label: 'By stage', icon: LayoutList },
  { value: 'people', label: 'By resource', icon: Users },
  { value: 'history', label: 'History', icon: Rows3 },
]

const isAllocated = (row) => row.status === 'allocated'

// Group the rows into stages in workflow order, and each stage's rows by slot.
// Stage order comes from the lowest task_no allocating into it — the workflow's
// own sequence, so no stage-order constant has to be kept in sync here. Rows
// whose stage is missing (task-only history) sort last.
function buildStages(allocations) {
  const byStage = new Map()
  for (const row of allocations) {
    const key = row.stage ?? `task-${row.task}`
    let stage = byStage.get(key)
    if (!stage) {
      stage = { key, code: row.stage_code, projectId: null, order: Number.MAX_SAFE_INTEGER, rows: [] }
      byStage.set(key, stage)
    }
    if (row.task_no != null) stage.order = Math.min(stage.order, row.task_no)
    if (!stage.projectId && row.project_id) stage.projectId = row.project_id
    stage.rows.push(row)
  }

  const stages = [...byStage.values()].sort((a, b) => a.order - b.order)
  for (const stage of stages) {
    const bySlot = new Map()
    for (const row of stage.rows) {
      if (!bySlot.has(row.slot)) bySlot.set(row.slot, [])
      bySlot.get(row.slot).push(row)
    }
    stage.slots = [...bySlot.entries()]
      .sort(([a], [b]) => slotOrder(a) - slotOrder(b))
      .map(([slot, rows]) => {
        const current = rows.filter(isAllocated)
        // R23-3f — Tech Req §4.7's indicator "on submitted rows". The reference
        // headcount is the `man_power_required` each row snapshotted from the
        // upstream manpower task; it is a per-stage constant, so the highest
        // value any of the slot's rows carries is it (an older row written before
        // a slot's requirement was known would otherwise read as 0).
        const required = Math.max(0, ...rows.map((r) => r.man_power_required || 0))
        const past = rows.filter((r) => !isAllocated(r))
        // Not measured when: the slot is one of the optional named extras
        // (approved-for-zero by design, PRD §5.7), or nobody holds it now but
        // somebody did — that is a **released** allocation (D11), i.e. history,
        // not a staffing gap. Flagging a finished stage as under-allocated would
        // make the indicator noise on every completed project.
        const measured = !isExtendedSlot(slot) && !(current.length === 0 && past.length > 0)
        return {
          slot,
          label: rows[0].slot_label || slotShortLabel(slot),
          current,
          past,
          required,
          health: measured ? slotHealth(required, current.length) : 'none',
        }
      })
    stage.activeCount = new Set(stage.rows.filter(isAllocated).map((r) => r.user)).size
  }
  return stages
}

// "Did this person already hold this slot in the stage before?" — returns the
// stage the unbroken run started in, or null when the allocation is new here.
// Status is ignored on purpose: a Red released at the end of an earlier stage
// still *continued* into this one, which is what the marker is reporting.
function makeContinuity(stages) {
  const held = stages.map((s) => new Set(s.rows.map((r) => `${r.slot}|${r.user}`)))
  return (index, slot, user) => {
    const key = `${slot}|${user}`
    let start = index
    while (start > 0 && held[start - 1].has(key)) start -= 1
    return start === index ? null : stages[start]
  }
}

// One row per person, with the slot(s) they held in each stage — the matrix's
// data. `cells` is keyed by stage index; people sort by their most senior slot
// so the Red leads, then Brown, White, auditors, team members.
function buildPeople(allocations, stages) {
  const stageIndex = new Map(stages.map((s, i) => [s.key, i]))
  const people = new Map()
  for (const row of allocations) {
    if (!row.user) continue
    let person = people.get(row.user)
    if (!person) {
      person = { id: row.user, name: row.user_name?.name || '—', cells: new Map(), rank: Number.MAX_SAFE_INTEGER }
      people.set(row.user, person)
    }
    person.rank = Math.min(person.rank, slotOrder(row.slot))
    const index = stageIndex.get(row.stage ?? `task-${row.task}`)
    if (index == null) continue
    if (!person.cells.has(index)) person.cells.set(index, [])
    person.cells.get(index).push(row)
  }

  const list = [...people.values()]
  for (const person of list) {
    person.activeStages = [...person.cells.values()].filter((rows) => rows.some(isAllocated)).length
  }
  return list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
}

// The people currently on the project, one chip per person+slot however many
// stages they span — the "who is on this today" answer the old table buried.
function buildCurrentTeam(allocations) {
  const members = new Map()
  for (const row of allocations) {
    if (!isAllocated(row) || !row.user) continue
    const key = `${row.slot}|${row.user}`
    const member = members.get(key)
    if (member) member.stages += 1
    else members.set(key, { key, slot: row.slot, name: row.user_name?.name || '—', stages: 1 })
  }
  return [...members.values()].sort(
    (a, b) => slotOrder(a.slot) - slotOrder(b.slot) || a.name.localeCompare(b.name),
  )
}

function allocationTitle(row) {
  const parts = [row.slot_label]
  parts.push(isAllocated(row) ? `allocated ${formatDate(row.allocated_on)}` : `released ${formatDate(row.released_on)}`)
  if (row.days_worked != null) parts.push(`${row.days_worked} day${row.days_worked === 1 ? '' : 's'}`)
  return parts.filter(Boolean).join(' · ')
}

// One stage card: its slots down the left, who holds each on the right.
function StageCard({ stage, index, continuityOf, showPast }) {
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <StageBadge stage={stage.code} />
            {stage.projectId && (
              <span className="text-xs tabular-nums text-muted-foreground">{stage.projectId}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {stage.activeCount} {stage.activeCount === 1 ? 'resource' : 'resources'} allocated
          </span>
        </div>

        <div className="divide-y">
          {stage.slots.map(({ slot, label, current, past, required, health }) => (
            <div key={slot} className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                <SlotBadge slot={slot} label={label} />
                {/* R23-3f — over (red) / under (amber) against the approved
                    manpower, the read-only counterpart of the queue's indicator. */}
                {health !== 'none' && (
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      health === 'over' ? 'font-medium text-red-600'
                        : health === 'under' ? 'font-medium text-amber-700 dark:text-amber-400'
                          : 'text-muted-foreground',
                    )}
                    title={
                      health === 'over' ? 'More allocated than the approved manpower'
                        : health === 'under' ? 'Fewer allocated than the approved manpower'
                          : 'Matches the approved manpower'
                    }
                  >
                    {current.length} of {required}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {current.map((row) => {
                  const from = continuityOf(index, slot, row.user)
                  return (
                    <div key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{row.user_name?.name || '—'}</span>
                      {from ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CornerDownRight className="size-3" />
                          continues from {stageLabel(from.code)}
                        </span>
                      ) : (
                        index > 0 && <span className="text-xs text-muted-foreground">new in this stage</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        · since {formatDate(row.allocated_on)}
                      </span>
                    </div>
                  )
                })}

                {current.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    Not currently held
                    {past.length > 0 && !showPast && ` · ${past.length} past ${past.length === 1 ? 'holder' : 'holders'}`}
                  </span>
                )}

                {showPast &&
                  past.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="line-through">{row.user_name?.name || '—'}</span>
                      <span>released {formatDate(row.released_on)}</span>
                      {row.days_worked != null && <span>· {row.days_worked}d</span>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Person × stage matrix. The name column is sticky so it survives the sideways
// scroll a long workflow needs; a filled run down a row is a resource who
// stayed, gaps are the stage-specific ones.
function ResourceMatrix({ stages, people, showPast }) {
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-card">Resource</TableHead>
              {stages.map((stage) => (
                <TableHead key={stage.key} className="whitespace-nowrap">
                  <StageBadge stage={stage.code} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="sticky left-0 z-10 bg-card">
                  <div className="font-medium">{person.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {person.activeStages} of {stages.length} stages
                  </div>
                </TableCell>
                {stages.map((stage, index) => {
                  const rows = (person.cells.get(index) || []).filter((r) => showPast || isAllocated(r))
                  return (
                    <TableCell key={stage.key}>
                      {rows.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {rows.map((row) => (
                            <SlotBadge
                              key={row.id}
                              slot={row.slot}
                              released={!isAllocated(row)}
                              title={allocationTitle(row)}
                            />
                          ))}
                        </div>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// The full append-only trail — one row per allocation, newest first.
function HistoryTable({ allocations }) {
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Allocated on</TableHead>
              <TableHead>Released on</TableHead>
              <TableHead className="text-right">Days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((row) => (
              <TableRow key={row.id}>
                <TableCell><StageBadge stage={row.stage_code} /></TableCell>
                <TableCell>
                  <SlotBadge slot={row.slot} label={row.slot_label} released={!isAllocated(row)} />
                </TableCell>
                <TableCell className="text-sm">
                  {row.user_name?.name || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <AllocationStatusBadge status={row.status} title={STATUS_TOOLTIP[row.status] || ''} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(row.allocated_on)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.released_on ? formatDate(row.released_on) : '—'}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                  {row.days_worked ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function LeadResourcesTab({ leadId }) {
  const { data: rows = [], isLoading } = useLeadResourceAllocations(leadId)
  const [view, setView] = useState('stage')
  const [showPast, setShowPast] = useState(false)

  // R14-1: legacy "TBD" rows named nobody — an undecided slot is now simply an
  // unfilled one, so they are no longer listed as if a person held the slot.
  const allocations = useMemo(() => rows.filter((a) => !a.is_tbd), [rows])
  const stages = useMemo(() => buildStages(allocations), [allocations])
  const continuityOf = useMemo(() => makeContinuity(stages), [stages])
  const people = useMemo(() => buildPeople(allocations, stages), [allocations, stages])
  const currentTeam = useMemo(() => buildCurrentTeam(allocations), [allocations])
  const pastCount = allocations.length - allocations.filter(isAllocated).length

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    )
  }

  if (allocations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No resources allocated on this lead yet. Resources are assigned on the allocation tasks in
          this lead's workflow — the Resource Manager (or the lead owner) fills each stage's slots.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Who is allocated to this project, stage by stage. An Execution Red usually carries the whole
          engagement; Browns, Whites and auditors change with what each stage needs. Managed by the
          Resource Manager (or the lead owner) on the allocation tasks — read-only here.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? 'default' : 'outline'}
              onClick={() => setView(value)}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Current team — the same fact the views repeat per stage, stated once. */}
      <Card className="py-0">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Currently allocated</span>
            <span className="text-xs text-muted-foreground">
              {stages.length} {stages.length === 1 ? 'stage' : 'stages'} · {people.length}{' '}
              {people.length === 1 ? 'person' : 'people'} involved
            </span>
          </div>
          {currentTeam.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              Nobody is holding a slot right now — every allocation has been released.
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentTeam.map((member) => (
                <div key={member.key} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1">
                  <SlotBadge slot={member.slot} />
                  <span className="text-sm font-medium">{member.name}</span>
                  {member.stages > 1 && (
                    <span className="text-xs text-muted-foreground">{member.stages} stages</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {view !== 'history' && pastCount > 0 && (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="ghost" onClick={() => setShowPast((v) => !v)}>
            {showPast ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showPast ? 'Hide' : 'Show'} released ({pastCount})
          </Button>
        </div>
      )}

      {view === 'stage' && (
        <div className="flex flex-col gap-3">
          {stages.map((stage, index) => (
            <StageCard
              key={stage.key}
              stage={stage}
              index={index}
              continuityOf={continuityOf}
              showPast={showPast}
            />
          ))}
        </div>
      )}

      {view === 'people' && (
        <div className="flex flex-col gap-2">
          <ResourceMatrix stages={stages} people={people} showPast={showPast} />
          <p className="text-xs text-muted-foreground">
            Each cell is the slot that person held in that stage — solid means still allocated
            {showPast && ', dashed means released'}. Hover a slot for its dates.
          </p>
        </div>
      )}

      {view === 'history' && <HistoryTable allocations={allocations} />}
    </div>
  )
}
