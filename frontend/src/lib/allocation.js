// Over/under-allocation arithmetic (R23-3, gated in R24) — Tech Req §4.7 /
// PRD §5.7:
//
//   allocated count > man_power_required  → red over-allocation
//   allocated count < man_power_required  → amber under-allocation
//
// "Shown live in the allocation form and on submitted rows", so this lives in
// `lib/` rather than in one of the three surfaces that need it (the Resources
// queue's table, the lead-side allocation form, the lead's Resources tab). The
// figure it compares against is the manpower captured upstream — Task 2 for 2HR,
// Task 9 for SnT, Task 16/23 for the project — which the backend resolves per
// slot into `allocation.required`.
//
// R24 — **when** the comparison is allowed to fire. R23-3 ran it on every slot of
// every step the moment the step appeared, and the queue deliberately lists steps
// that are still `pending` (R12-4: staffing in advance is the point, and *every*
// team-allocation step — 3, 10, 17 — is trigger-gated to its stage's start date,
// so a freshly started project's steps are all pending). The result was a project
// reporting itself several people short on day one, with nothing to do about it.
//
// The user, 2026-08-05: staffing early is expected, audit "will generally come at
// last", and a missing Red is the gap worth naming. So a slot is compared only
// once its requirement is both **knowable** and **due**:
//
//   execution_red         always, while the step is in play. It is fixed at 1 and
//                         mandatory to submit, so empty ⇒ its own 'red' verdict.
//                         Exception: a not-yet-due step whose Red carries over —
//                         see `waitingReason`'s 'carry_over'.
//   execution_brown       once `manpower_requested` (the upstream request has been
//   white                 submitted — before that `required` reads 0 because
//                         nobody has been *asked* yet, not because zero was
//                         approved) **and** the step is no longer `pending`.
//   auditor_1 / auditor_2 once the step is no longer `pending`. An audit step sits
//                         pending for a project's whole life.
//   the R12 named extras  never (DD-R23-4) — PRD §5.7: "always optional: leaving
//                         one empty is neither under-allocation nor a submit
//                         blocker", and by the same token filling one is not
//                         excess. They carry `required: 0`.
//
// Nothing is *hidden* by the hold-off: an unmeasured slot still reports what it
// will need (`required`) and who is in it — it just doesn't render that as a
// red/amber verdict against a step nobody can act on yet.

const EXTRA_AUDITOR_SLOTS = ['auditor_3', 'auditor_4']
const CORE_AUDITOR_SLOTS = ['auditor_1', 'auditor_2']
// The two slots sized by the upstream manpower request; everything else is a
// fixed named slot requiring exactly one person (or an optional extra).
const MANPOWER_SIZED_SLOTS = ['execution_brown', 'white']

const IN_PLAY_STATUSES = ['open', 'pending', 'hold']

export function isExtendedSlot(slot) {
  return slot.startsWith('project_member_') || EXTRA_AUDITOR_SLOTS.includes(slot)
}

export function isCoreAuditorSlot(slot) {
  return CORE_AUDITOR_SLOTS.includes(slot)
}

// Whether this step's manpower counts yet. A `pending` step is listed so it can
// be staffed ahead of time, not because it is due — and `closed` stays measured,
// so a finished step still reads "Full" rather than reverting to a muted dash.
export function isStepDue(task) {
  return task?.status !== 'pending'
}

// Legacy pre-R14 "TBD" rows named nobody, so they don't count as allocated.
function occupantCount(rows) {
  return (rows || []).filter((o) => !o.is_tbd).length
}

export function slotHealth(required, allocated) {
  if (allocated > required) return 'over'
  if (allocated < required) return 'under'
  return 'ok'
}

// Why this slot's requirement isn't comparable yet, else null:
//
//   'manpower'   the upstream request hasn't been submitted, so there is no
//                figure at all
//   'not_due'    the figure exists but the step isn't live
//   'carry_over' the Execution Red of a not-yet-due step, where the lead already
//                has a Red to carry into it. `resources.carry_forward_red` runs
//                when a step **opens**, not when it is created, so a pending step
//                genuinely holds no Red row — but calling that "Red required"
//                would fire on every stage after the first, for a slot the server
//                is about to fill by itself. Only a pending step with *no* Red to
//                inherit (the first allocation of a lead) is a real gap.
//
// Ordered most-specific first; the first match wins.
function waitingReason(task, alloc, slot) {
  const sized = MANPOWER_SIZED_SLOTS.includes(slot)
  if (sized && alloc.manpower_requested === false) return 'manpower'
  if ((sized || isCoreAuditorSlot(slot)) && !isStepDue(task)) return 'not_due'
  if (slot === 'execution_red' && !isStepDue(task) && alloc.prefill?.execution_red) {
    return 'carry_over'
  }
  return null
}

// Which hold-off to name when several apply to one step. Manpower leads because
// it is the only one someone has to chase; carry-over trails because it is the
// one that resolves with no action at all.
const WAITING_PRECEDENCE = ['manpower', 'not_due', 'carry_over']

// One slot's staffing picture: what it needs, who holds it, and whether the two
// may be compared at all. Every surface reads its wording off this, so none of
// them does its own `required > 0` arithmetic any more.
//
//   status 'red'     — the mandatory Execution Red is empty (DD-R24-2)
//   status 'waiting' — not comparable yet; `waiting` says why
//   status 'none'    — outside the comparison entirely (a named extra)
//   else             — 'over' / 'under' / 'ok'
export function slotMeasure(task, slot) {
  const alloc = task?.allocation || {}
  const row = {
    slot,
    label: alloc.slot_labels?.[slot] || slot,
    required: alloc.required?.[slot] || 0,
    allocated: occupantCount(alloc.occupants?.[slot]),
    measured: false,
    waiting: null,
    status: 'none',
  }
  if (isExtendedSlot(slot)) return row

  const waiting = waitingReason(task, alloc, slot)
  if (waiting) return { ...row, waiting, status: 'waiting' }

  return {
    ...row,
    measured: true,
    status:
      slot === 'execution_red' && row.allocated === 0
        ? 'red'
        : slotHealth(row.required, row.allocated),
  }
}

// Per-slot rows plus the task-level verdict for one allocation task.
//
// Precedence is red → over → under → waiting → ok. A missing Red leads because it
// is the only gap that stops the step being submitted, so it is the next action
// whatever else the row says (DD-R24-2); over outranks under below it because
// past the approved manpower is the finding that costs money. The per-slot
// `slots` array carries everything, so a caller can show the full breakdown (the
// queue's tooltip does).
export function allocationHealth(task) {
  const alloc = task?.allocation || {}
  const rows = (alloc.slots || [])
    .filter((s) => !isExtendedSlot(s))
    .map((slot) => slotMeasure(task, slot))

  const measured = rows.filter((r) => r.measured)
  const waiting = rows.filter((r) => r.status === 'waiting')
  const over = measured.filter((r) => r.status === 'over')
  const under = measured.filter((r) => r.status === 'under' || r.status === 'red')
  const redMissing = measured.some((r) => r.status === 'red')

  // Totals count only what is being compared — folding in an unmeasured slot's
  // requirement would imply a gap this verdict is not claiming.
  const totalRequired = measured.reduce((n, r) => n + r.required, 0)
  const totalAllocated = measured.reduce((n, r) => n + r.allocated, 0)

  // A step that has been through its whole lifecycle and holds nobody is not
  // under-allocated — its people were **released** (D11: 2HR/SnT release when
  // their stage closes, Implementation/Extension when Task 27 opens). Only
  // `allocated` rows reach `occupants`, so without this every finished stage
  // would report itself as short of manpower forever, which is the opposite of
  // an actionable indicator. Counted across *all* rows, measured or not.
  const held = rows.reduce((n, r) => n + r.allocated, 0)
  const spent = !IN_PLAY_STATUSES.includes(task?.status) && held === 0

  return {
    slots: rows,
    totalRequired,
    totalAllocated,
    // 'none' — nothing to measure: a step that staffs no manpower-counted slot,
    // or one whose allocation has already been released.
    status:
      rows.length === 0 || spent ? 'none'
        : redMissing ? 'red'
          : over.length ? 'over'
            : under.length ? 'under'
              : measured.length === 0 ? 'waiting'
                : 'ok',
    // Which hold-off explains a 'waiting' verdict.
    waitingReason:
      WAITING_PRECEDENCE.find((reason) => waiting.some((r) => r.waiting === reason)) || null,
    overBy: over.reduce((n, r) => n + (r.allocated - r.required), 0),
    shortBy: under.reduce((n, r) => n + (r.required - r.allocated), 0),
  }
}
