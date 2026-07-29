"""Resource-allocation service (Tech Req §4.7, §7; PRD §5.7 — R5 rebuild).

Encapsulates everything the workflow does with the append-only
``resource_allocation`` rows so the engine stays a generic JSON interpreter:

- **On an allocation task open** (3/10/17/18/24/25): no row is created upfront
  any more (R5) — the Resource Manager / Default BD Person (D12) fills each
  slot as they decide, and every fill is its own row. ``notify_allocation_task_open``
  just pings the Resource Managers that staffing is needed.
- **Slot actions:** ``allocate`` (first fill), ``reassign`` (release + append a
  replacement, linked by ``replaces``), ``release`` (free a slot with no
  replacement) — never an overwrite (§4.7).
- **execution_red resolution:** the successor of an allocation task — and every
  ``execution_red``-assigned task in that block — is worked by the Execution
  Red currently allocated. ``latest_execution_red`` reads the most recent Red
  row off the lead (preferring an ``allocated`` one, else the last it ever had —
  R9/DD-R9-5) so the engine needs no task numbers.
- **The Red is mandatory and continuous (R9):** ``carry_forward_red`` pre-fills
  an opening allocation task's Red slot with the lead's current Red, and
  ``release`` refuses to empty a Red slot — it changes only via ``reassign``,
  which cascades the handover onto the tasks it was driving.
- **Submit** (§7.5): validate the task's mandatory slots are filled, then close
  the allocation task, which opens the next task assigned to that Execution Red.
  ``submit``.
- **Release lifecycle (D11):** 2HR/SnT slots release when their stage closes
  (``release_stage_allocations``, called from the engine's stage reconcile);
  Implementation/Extension slots release when Task 27 opens
  (``release_open_engagement_allocations``, called from the engine's generic
  ``on_open`` hook) — not from a stage close, since those stages are not
  auto-closed until R6.

The engine imports this module; this module imports the engine lazily (inside
``submit``) to avoid an import cycle.
"""

import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import events, projects
from .models import LeadStage, Notification, ResourceAllocation, Task

RESOURCE_MANAGER_GROUP = "resource_manager"

# Where a Resource Manager's notifications land (R12-1): their own queue, which
# staffs the slots in place. R13-1 gave the role its lead page back, so the lead
# deep-link would work again too — the queue stays the target on purpose, since it
# is the one screen that lists *every* allocation waiting on them.
RESOURCE_QUEUE_LINK = "/resources"


def occupant_name(user):
    """Display name snapshot for the denormalized ``ResourceAllocation.names``
    column: the user's name, else "" (R14-1 — every slot names a real person)."""
    return user.name if user is not None else ""

# "Team" slots (Execution Red/Brown/White) are captured on tasks 3/10/17/24;
# "auditor" slots (Auditor 1/2) on tasks 18/25 — both groups are now real
# allocation tasks (R5); which slots a given task manages is workflow-JSON
# data (``allocation_slots``), read generically below.

# 2HR/SnT release their allocated resources when the *stage* closes (D11) —
# the fixed pair this business rule names, not workflow-editable task numbers.
STAGE_CLOSE_RELEASE_STAGES = {LeadStage.TWO_HR, LeadStage.SNT}

# Implementation + every Extension loop (E1, E2, …) release on Task 27 opening
# instead (D11) — matched by stage code, not by a fixed list (the loop counter
# is unbounded).
_EXTENSION_STAGE_RE = re.compile(r"^E\d+$")


def _is_engagement_stage(stage_code):
    return stage_code == LeadStage.IM or bool(_EXTENSION_STAGE_RE.match(stage_code or ""))


def _notify_resource_managers(task):
    """Tell every Resource Manager an allocation task is waiting (PRD §5.7).

    A team-allocation task opens unassigned when the Resource Manager owns it
    (R9-5: it opens assigned to the lead's Default BD Person instead when Task 2
    answered "no manpower support required"), so the normal "notify the new
    assignee" path may never fire. Best-effort/additive: notify every active
    Resource Manager — they work the queue at ``/resources``, which is where the
    notification points (R12-1: staffing happens in that screen now, and a pure
    Resource Manager no longer has access to a lead page).
    """
    User = get_user_model()
    lead = task.lead
    managers = User.objects.filter(
        groups__name=RESOURCE_MANAGER_GROUP, is_active=True
    ).distinct()
    for rm in managers:
        events.notify(
            rm,
            Notification.Type.TASK_OPENED,
            f"Resource allocation needed for “{lead.company_name} — {lead.project_name}” "
            f"({task.task_name}).",
            RESOURCE_QUEUE_LINK,
        )


def notify_allocation_task_open(task):
    """Called when an allocation task opens (R5) — see :func:`_notify_resource_managers`."""
    _notify_resource_managers(task)


def _num(value):
    """Coerce a stored numeric field value to int (≥0), else 0."""
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return 0
    return max(n, 0)


def _manpower_split(lead, source):
    """Read the Brown/White man-power split off the most-recent closed source
    task, returning ``(brown, white)``.

    The ``manpower_source`` hint lists the field keys (``manpower_brown`` /
    ``manpower_white``); Brown is capped at 1 by its field schema (a single
    holder), White is an open headcount.
    """
    if not source:
        return 0, 0
    src_task = (
        lead.tasks.filter(task_no=source.get("task_no"), status=Task.Status.CLOSED)
        .order_by("-task_end_dt", "-id")
        .first()
    )
    if src_task is None:
        return 0, 0
    values = src_task.extra_fields or {}
    brown = white = 0
    for key in source.get("fields", []):
        n = _num(values.get(key))
        if "white" in key.lower():
            white += n
        else:
            brown += n
    return brown, white


def slot_requirements(lead, tdef):
    """``{slot: required_headcount}`` for every slot this allocation task manages.

    Computed live from the upstream ``manpower_source`` hint (§4.7) rather than
    stored, so the required figure shows correctly on an empty form before any
    row exists. Execution Red / Auditor 1 / Auditor 2 are always exactly 1
    (fixed named slots); Execution Brown and White come from the upstream
    Brown/White manpower fields (Brown is capped at 1 by its own field schema).
    The R12 extras (Auditors 3–4, Project Members 1–10) require **0** — they are
    optional named slots, so leaving them empty is neither under-allocation nor
    a submit blocker.
    """
    brown, white = _manpower_split(lead, tdef.get("manpower_source"))
    reqs = {}
    for slot in tdef.get("allocation_slots", []):
        if slot == ResourceAllocation.Slot.WHITE:
            reqs[slot] = white
        elif slot == ResourceAllocation.Slot.EXECUTION_BROWN:
            reqs[slot] = brown
        elif slot in ResourceAllocation.EXTENDED_SLOTS:
            reqs[slot] = 0
        else:
            reqs[slot] = 1
    return reqs


def is_resource_manager(user):
    return bool(
        user
        and user.is_authenticated
        and user.groups.filter(name=RESOURCE_MANAGER_GROUP).exists()
    )


def visible_slots(user, tdef):
    """The slots of ``tdef`` that ``user`` may see and fill (R12, decision 3).

    The restored named extras (Auditors 3–4, Project Members 1–10) are the
    **Resource Manager's** own working detail: the lead's Default BD Person keeps
    D12 staffing rights but on Red/Brown/White only, and everyone else — the
    lead's own people reading the Resources tab — sees just those three too.
    Ordering follows the workflow def, so the form order is stable.
    """
    slots = tdef.get("allocation_slots", []) if tdef else []
    if is_resource_manager(user):
        return list(slots)
    return [s for s in slots if s not in ResourceAllocation.EXTENDED_SLOTS]


def occupants(task, slot):
    """Currently-``allocated`` rows for ``task``'s ``slot`` (id order)."""
    return ResourceAllocation.objects.filter(
        task=task, slot=slot, status=ResourceAllocation.Status.ALLOCATED,
    ).select_related("user").order_by("id")


def prefill_suggestions(task, tdef):
    """``{slot: user_id}`` suggestions carried from the lead's previous stage-cycle
    allocation (§4.7 — "Extension prefill", generalized to every stage handover
    as in the prior wide-table model). Suggestions only — no rows are written
    until the Resource Manager actually allocates.

    Looks at the most recent *other* allocation task on this lead that manages
    at least one of the same slots and takes its current occupant per slot (the
    first one, for single-occupancy slots).
    """
    slots = set(tdef.get("allocation_slots", []))
    if not slots:
        return {}
    prev_task = (
        Task.objects.filter(lead=task.lead, is_allocation_task=True)
        .exclude(pk=task.pk)
        .order_by("-id")
        .first()
    )
    if prev_task is None:
        return {}
    suggestions = {}
    for slot in slots:
        row = (
            ResourceAllocation.objects.filter(
                task=prev_task, slot=slot,
                status=ResourceAllocation.Status.ALLOCATED, user__isnull=False,
            )
            .order_by("id")
            .first()
        )
        if row is not None:
            suggestions[slot] = row.user_id
    return suggestions


def allocation_context(task, tdef, viewer=None):
    """The full allocation picture for one allocation-task instance, or ``None``.

    Feeds the Resources screen and the ``TaskSerializer.allocation`` field:
    which slots this task manages, how many of each are required, who
    currently occupies each, and cross-cycle prefill suggestions.

    ``viewer`` (R12) restricts the slot list to what that user may see — the
    named extras are Resource-Manager-only (:func:`visible_slots`). It defaults
    to ``None``, which restricts rather than opens up (fail-closed: a caller with
    no user in hand is not a Resource Manager).
    """
    if not tdef or not tdef.get("is_allocation_task"):
        return None
    slots = visible_slots(viewer, tdef)
    allowed = set(slots)
    return {
        "slots": slots,
        "required": {
            s: n for s, n in slot_requirements(task.lead, tdef).items() if s in allowed
        },
        "occupants": {slot: list(occupants(task, slot)) for slot in slots},
        "prefill": {
            s: uid for s, uid in prefill_suggestions(task, tdef).items() if s in allowed
        },
    }


@transaction.atomic
def allocate(task, tdef, slot, *, user=None, remark="", actor=None):
    """First fill of a slot on ``task`` (§4.7). Raises ``ValidationError`` if the
    slot doesn't belong to this task, isn't one ``actor`` may fill, is already
    occupied (single-occupancy slots must go through :func:`reassign`), or no
    user was named — every slot, White included, is filled by a real person
    (R14-1: "to be decided" is not an occupant, it's an unfilled slot, which is
    already expressed by there being no row).
    """
    slots = visible_slots(actor, tdef)
    if slot not in slots:
        if slot in tdef.get("allocation_slots", []):
            # It exists on the task but isn't this caller's to fill (R12) — the
            # named extras belong to the Resource Manager.
            raise serializers.ValidationError(
                "Only the Resource Manager can allocate that slot."
            )
        raise serializers.ValidationError("This task does not manage that slot.")
    if user is None:
        raise serializers.ValidationError("Select a user.")
    if slot in ResourceAllocation.SINGLE_OCCUPANCY_SLOTS and occupants(task, slot).exists():
        raise serializers.ValidationError(
            "This slot is already filled — reassign it instead of allocating again."
        )
    reqs = slot_requirements(task.lead, tdef)
    return ResourceAllocation.objects.create(
        lead=task.lead,
        stage=task.stage,
        project_id=projects.row_project_id(task.lead, task.stage),
        task=task,
        slot=slot,
        user=user,
        names=occupant_name(user),
        man_power_required=reqs.get(slot, 0),
        remark=remark,
    )


@transaction.atomic
def reassign(task, current, *, user=None, actor=None, remark=""):
    """Move ``current`` (an ``allocated`` row) to a new occupant — release the
    old row and append a new one linked via ``replaces`` (§4.7, never overwrite).

    Cascades an Execution-Red swap onto the tasks it was driving, mirroring the
    pre-R5 behaviour.
    """
    if current.status != ResourceAllocation.Status.ALLOCATED:
        raise serializers.ValidationError("This allocation has already been released.")
    # R12: the named extras are the Resource Manager's alone — to reassign as
    # much as to fill.
    if current.slot in ResourceAllocation.EXTENDED_SLOTS and not is_resource_manager(actor):
        raise serializers.ValidationError(
            "Only the Resource Manager can reassign that slot."
        )
    if user is None:
        raise serializers.ValidationError("Select a user.")
    now = timezone.now()
    current.status = ResourceAllocation.Status.RELEASED
    current.released_on = now
    current.save(update_fields=["status", "released_on", "updated_at"])
    new_row = ResourceAllocation.objects.create(
        lead=current.lead,
        stage=current.stage,
        project_id=current.project_id,
        task=current.task,
        slot=current.slot,
        user=user,
        names=occupant_name(user),
        replaces=current,
        man_power_required=current.man_power_required,
        remark=remark,
        allocated_on=now,
    )
    if (
        current.slot == ResourceAllocation.Slot.EXECUTION_RED
        and current.user_id
        and user
        and current.user_id != user.id
        and actor is not None
    ):
        _reassign_execution_red_tasks(current.lead, current.user, user, actor)
    return new_row


def _reassign_execution_red_tasks(lead, old_red, new_red, actor):
    """Cascade a mid-lead Execution-Red swap onto the tasks it was driving.

    Every task on this lead still in play (``open``/``hold``/``pending``) and
    assigned to the outgoing Red moves to the incoming one, and both are
    notified. Closed/skipped tasks keep their historical assignee.
    """
    tasks = list(
        lead.tasks.filter(
            assigned_to=old_red,
            status__in=[Task.Status.OPEN, Task.Status.HOLD, Task.Status.PENDING],
        )
    )
    if not tasks:
        return tasks
    lead.tasks.filter(pk__in=[t.pk for t in tasks]).update(assigned_to=new_red)
    lead_label = f"{lead.company_name} — {lead.project_name}"
    if old_red.id != actor.id:
        events.notify(
            old_red,
            Notification.Type.TASK_REASSIGNED,
            f"{new_red.name} is now Execution Red on “{lead_label}” — "
            f"{len(tasks)} task(s) you held were reassigned to them.",
            events.lead_link(lead),
        )
    if new_red.id != actor.id:
        events.notify(
            new_red,
            Notification.Type.TASK_REASSIGNED,
            f"You are now Execution Red on “{lead_label}” — "
            f"{len(tasks)} task(s) were reassigned to you.",
            events.lead_link(lead),
        )
    return tasks


@transaction.atomic
def release(row, *, actor=None):
    """Free a slot with no replacement (e.g. one White too many). Raises if the
    row is already released, if it is the Execution Red, or if it is one of the
    Resource-Manager-only named extras and ``actor`` isn't one (R12).

    R9 (DD-R9-9): the Execution Red is mandatory on every stage and drives the
    assignment of every ``execution_red`` task, so it can never be emptied — a
    Red change goes through :func:`reassign` (which appends the replacement and
    cascades the task handover) instead.
    """
    if row.status != ResourceAllocation.Status.ALLOCATED:
        raise serializers.ValidationError("This allocation has already been released.")
    if row.slot in ResourceAllocation.EXTENDED_SLOTS and not is_resource_manager(actor):
        raise serializers.ValidationError(
            "Only the Resource Manager can release that slot."
        )
    if row.slot == ResourceAllocation.Slot.EXECUTION_RED:
        raise serializers.ValidationError(
            "The Execution Red cannot be left empty — reassign it to a different "
            "Red instead of releasing it."
        )
    row.status = ResourceAllocation.Status.RELEASED
    row.released_on = timezone.now()
    row.save(update_fields=["status", "released_on", "updated_at"])
    return row


def _red_rows(lead):
    """Every Execution-Red row on ``lead``, newest first."""
    return ResourceAllocation.objects.filter(
        lead=lead, slot=ResourceAllocation.Slot.EXECUTION_RED,
    ).order_by("-id")


def latest_execution_red(lead):
    """The Execution Red to assign ``execution_red`` tasks to (§7.5).

    Prefers the most recent still-``allocated`` Red — the current engagement
    block's Red — and otherwise falls back to the **last Red the lead ever had**
    (R9, DD-R9-5). The fallback matters because D11 releases the 2HR/SnT Red when
    its stage closes: without it, an ``execution_red`` task opening between that
    close and the next allocation task would open unassigned, contradicting "the
    Red is seen throughout, in every step." None only for a lead that has never
    had a Red allocated.
    """
    rows = _red_rows(lead).select_related("user")
    row = rows.filter(status=ResourceAllocation.Status.ALLOCATED).first() or rows.first()
    return row.user if row else None


@transaction.atomic
def carry_forward_red(task, tdef):
    """Pre-fill an opening allocation task's Execution Red slot with the lead's
    current Red (R9, DD-R9-4) — returns the new row, or None.

    The Red is mandatory on every stage and continuous across them, so a later
    allocation task must open with it **already allocated** rather than empty
    (which used to block its own Submit until someone re-picked the same person).
    A carry-forward is a genuine allocation, so it appends its own append-only
    row (§4.7) rather than copying or re-pointing the previous one. No-op when the
    task doesn't manage the Red slot, the slot is already filled, or the lead has
    never had a Red.
    """
    if ResourceAllocation.Slot.EXECUTION_RED not in tdef.get("allocation_slots", []):
        return None
    if occupants(task, ResourceAllocation.Slot.EXECUTION_RED).exists():
        return None
    red = latest_execution_red(task.lead)
    if red is None:
        return None
    reqs = slot_requirements(task.lead, tdef)
    return ResourceAllocation.objects.create(
        lead=task.lead,
        stage=task.stage,
        project_id=projects.row_project_id(task.lead, task.stage),
        task=task,
        slot=ResourceAllocation.Slot.EXECUTION_RED,
        user=red,
        names=occupant_name(red),
        man_power_required=reqs.get(ResourceAllocation.Slot.EXECUTION_RED, 1),
        remark="Carried forward from the previous stage",
    )


@transaction.atomic
def release_stage_allocations(lead, stage):
    """Release every ``allocated`` row of ``stage`` (D11 — 2HR/SnT release when
    their stage closes). Called from the engine's stage reconcile."""
    ResourceAllocation.objects.filter(
        lead=lead, stage=stage, status=ResourceAllocation.Status.ALLOCATED,
    ).update(status=ResourceAllocation.Status.RELEASED, released_on=timezone.now())


@transaction.atomic
def release_open_engagement_allocations(lead):
    """Release Implementation/Extension-loop allocations (D11 — these release
    when Task 27 opens, not on a stage close, since IM/E{n} stages aren't
    auto-closed until R6). Called from the engine's generic ``on_open`` hook."""
    stage_ids = [
        s.id for s in lead.stages.all() if _is_engagement_stage(s.stage)
    ]
    if not stage_ids:
        return
    ResourceAllocation.objects.filter(
        lead=lead, stage_id__in=stage_ids, status=ResourceAllocation.Status.ALLOCATED,
    ).update(status=ResourceAllocation.Status.RELEASED, released_on=timezone.now())


# The slots an allocation task cannot be submitted (or auto-closed) without: the
# Execution Red, because the successor task is assigned to whoever fills it, and
# Auditors 1–2, carried over from their pre-R5 required text fields. Everything
# else — Brown, the White pool, and the R12 named extras — is optional
# (under-allocation is surfaced as an indicator, not a blocker).
MANDATORY_SLOTS = frozenset({
    ResourceAllocation.Slot.EXECUTION_RED,
    ResourceAllocation.Slot.AUDITOR_1,
    ResourceAllocation.Slot.AUDITOR_2,
})


def missing_mandatory_slots(task, tdef):
    """The mandatory slots of ``tdef`` that ``task`` has nobody allocated to."""
    return [
        slot
        for slot in tdef.get("allocation_slots", [])
        if slot in MANDATORY_SLOTS and not occupants(task, slot).exists()
    ]


@transaction.atomic
def auto_close_if_staffed(task, tdef, actor=None):
    """Complete an ``auto_close_when_staffed`` allocation task that opened with
    its mandatory slots already filled (R12) — else return ``None``.

    This is what makes staffing *in advance* count: the Resource Manager can
    allocate Task 18's auditors while it is still trigger-``pending``, and when
    the trigger date arrives the task closes itself instead of sitting in a queue
    as unfinished work. If the auditors were **not** pre-allocated it opens and
    waits normally, so the same step is "complete or not" exactly according to
    whether the allocation was done ahead of time.

    Only tasks whose def carries the flag are eligible (Task 18 — it routes to
    nothing, so an automatic close sets nothing else in motion).
    """
    from . import engine  # lazy: engine imports this module at load time

    if not tdef.get("auto_close_when_staffed"):
        return None
    if task.status != Task.Status.OPEN:
        return None
    if missing_mandatory_slots(task, tdef):
        return None
    events.log_activity(
        task.lead,
        actor,
        "resource",
        f"{task.task_name} closed automatically — allocated in advance",
    )
    engine.complete_task(task, actor)
    task.refresh_from_db()
    return task


@transaction.atomic
def submit(task, tdef, user):
    """Resource Manager / Default BD Person (D12) submits a staffed allocation
    task (§7.5): validates the mandatory slots, then completes the task, which
    opens the next workflow task assigned to the selected Execution Red.

    Mandatory: :data:`MANDATORY_SLOTS` — Execution Red (team tasks: the next task
    depends on it) and Auditors 1–2 (auditor tasks: carried over from their
    pre-R5 required text fields). Everything else, the R12 named extras
    included, stays optional (under-allocation is surfaced as an indicator, not a
    submit blocker). Raises ``ValidationError`` if the task is already
    submitted/closed or a mandatory slot is empty.
    """
    from . import engine  # lazy: engine imports this module at load time

    if task.status not in (Task.Status.OPEN, Task.Status.PENDING):
        raise serializers.ValidationError(
            "This allocation has already been submitted or has no open task."
        )
    for slot in missing_mandatory_slots(task, tdef):
        raise serializers.ValidationError(
            f"Select {ResourceAllocation.Slot(slot).label} before submitting."
        )
    if task.status == Task.Status.PENDING:
        task = engine.open_pending_task(task)
        # R12: opening it may have closed it on the spot (auto_close_when_staffed
        # — the slots are filled, which is exactly what submit just validated).
        if task.status == Task.Status.CLOSED:
            return []
    return engine.complete_task(task, user)
