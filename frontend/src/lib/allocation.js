// Over/under-allocation arithmetic (R23-3) — Tech Req §4.7 / PRD §5.7:
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
// The R12 named extras (Auditors 3–4, Project Members 1–10) are excluded on
// **both** sides. PRD §5.7: "They are always optional: leaving one empty is
// neither under-allocation nor a submit blocker" — and by the same token filling
// one is not excess. They carry `required: 0`, so counting them would report
// every optional name the Resource Manager adds as an over-allocation.

const EXTRA_AUDITOR_SLOTS = ['auditor_3', 'auditor_4']

export function isExtendedSlot(slot) {
  return slot.startsWith('project_member_') || EXTRA_AUDITOR_SLOTS.includes(slot)
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

// Per-slot rows plus the task-level verdict for one allocation task.
//
// `status` is 'over' whenever any slot is over-allocated, even if another is
// short: red outranks amber, because over the approved manpower is the finding
// that costs money. The per-slot `slots` array carries both, so a caller can
// show the full breakdown (the queue's tooltip does).
export function allocationHealth(task) {
  const alloc = task?.allocation || {}
  const slots = (alloc.slots || []).filter((s) => !isExtendedSlot(s))

  const rows = slots.map((slot) => {
    const required = alloc.required?.[slot] || 0
    const allocated = occupantCount(alloc.occupants?.[slot])
    return {
      slot,
      label: alloc.slot_labels?.[slot] || slot,
      required,
      allocated,
      status: slotHealth(required, allocated),
    }
  })

  const totalRequired = rows.reduce((n, r) => n + r.required, 0)
  const totalAllocated = rows.reduce((n, r) => n + r.allocated, 0)
  const over = rows.filter((r) => r.status === 'over')
  const under = rows.filter((r) => r.status === 'under')

  // A step that has been through its whole lifecycle and holds nobody is not
  // under-allocated — its people were **released** (D11: 2HR/SnT release when
  // their stage closes, Implementation/Extension when Task 27 opens). Only
  // `allocated` rows reach `occupants`, so without this every finished stage
  // would report itself as short of manpower forever, which is the opposite of
  // an actionable indicator.
  const inPlay = ['open', 'pending', 'hold'].includes(task?.status)
  const spent = !inPlay && totalAllocated === 0

  return {
    slots: rows,
    totalRequired,
    totalAllocated,
    // 'none' — nothing to measure: a step that staffs no manpower-counted slot,
    // or one whose allocation has already been released.
    status:
      rows.length === 0 || spent ? 'none'
        : over.length ? 'over'
          : under.length ? 'under'
            : 'ok',
    overBy: over.reduce((n, r) => n + (r.allocated - r.required), 0),
    shortBy: under.reduce((n, r) => n + (r.required - r.allocated), 0),
  }
}
