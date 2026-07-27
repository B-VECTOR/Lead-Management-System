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
  Red currently allocated. ``latest_execution_red`` reads the most recent
  ``allocated`` Red row off the lead so the engine needs no task numbers.
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

from . import events
from .models import LeadStage, Notification, ResourceAllocation, Task

RESOURCE_MANAGER_GROUP = "resource_manager"


def occupant_name(user, is_tbd):
    """Display name snapshot for the denormalized ``ResourceAllocation.names``
    column: the user's name, ``"TBD"`` for a to-be-decided White slot, else ""."""
    if user is not None:
        return user.name
    return "TBD" if is_tbd else ""

# "Team" slots (Execution Red/Brown/White) are captured on tasks 3/10/17/24;
# "auditor" slots (Auditor 1/2) on tasks 18/25 — both groups are now real
# allocation tasks (R5); which slots a given task manages is workflow-JSON
# data (``allocation_slots``), read generically below.

# 2HR/SnT release their allocated resources when the *stage* closes (D11) —
# the fixed pair this business rule names, not workflow-editable task numbers.
STAGE_CLOSE_RELEASE_STAGES = {LeadStage.TWO_HR, LeadStage.SNT}

# Implementation + every Extension loop (E0, E1, …) release on Task 27 opening
# instead (D11) — matched by stage code, not by a fixed list (the loop counter
# is unbounded).
_EXTENSION_STAGE_RE = re.compile(r"^E\d+$")


def _is_engagement_stage(stage_code):
    return stage_code == LeadStage.IM or bool(_EXTENSION_STAGE_RE.match(stage_code or ""))


def _notify_resource_managers(task):
    """Tell every Resource Manager an allocation task is waiting (PRD §5.7).

    Allocation tasks open unassigned — they are staffed from the role-scoped
    ``/resources`` screen, so the normal "notify the new assignee" path never
    fires for them. Best-effort/additive: notify every active Resource Manager.
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
            events.lead_link(lead),
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
    """
    brown, white = _manpower_split(lead, tdef.get("manpower_source"))
    reqs = {}
    for slot in tdef.get("allocation_slots", []):
        if slot == ResourceAllocation.Slot.WHITE:
            reqs[slot] = white
        elif slot == ResourceAllocation.Slot.EXECUTION_BROWN:
            reqs[slot] = brown
        else:
            reqs[slot] = 1
    return reqs


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


def allocation_context(task, tdef):
    """The full allocation picture for one allocation-task instance, or ``None``.

    Feeds the Resources screen and the ``TaskSerializer.allocation`` field:
    which slots this task manages, how many of each are required, who
    currently occupies each, and cross-cycle prefill suggestions.
    """
    if not tdef or not tdef.get("is_allocation_task"):
        return None
    slots = tdef.get("allocation_slots", [])
    return {
        "slots": slots,
        "required": slot_requirements(task.lead, tdef),
        "occupants": {slot: list(occupants(task, slot)) for slot in slots},
        "prefill": prefill_suggestions(task, tdef),
    }


@transaction.atomic
def allocate(task, tdef, slot, *, user=None, is_tbd=False, remark=""):
    """First fill of a slot on ``task`` (§4.7). Raises ``ValidationError`` if the
    slot doesn't belong to this task, is already occupied (single-occupancy
    slots must go through :func:`reassign`), or the fill is invalid (TBD is
    White-only; every other slot needs a user).
    """
    slots = tdef.get("allocation_slots", [])
    if slot not in slots:
        raise serializers.ValidationError("This task does not manage that slot.")
    if is_tbd and slot != ResourceAllocation.Slot.WHITE:
        raise serializers.ValidationError("Only White may be left TBD.")
    if not is_tbd and user is None:
        raise serializers.ValidationError("Select a user, or mark White as TBD.")
    if slot in ResourceAllocation.SINGLE_OCCUPANCY_SLOTS and occupants(task, slot).exists():
        raise serializers.ValidationError(
            "This slot is already filled — reassign it instead of allocating again."
        )
    reqs = slot_requirements(task.lead, tdef)
    return ResourceAllocation.objects.create(
        lead=task.lead,
        stage=task.stage,
        task=task,
        slot=slot,
        user=user,
        names=occupant_name(user, is_tbd),
        is_tbd=is_tbd,
        man_power_required=reqs.get(slot, 0),
        remark=remark,
    )


@transaction.atomic
def reassign(task, current, *, user=None, is_tbd=False, actor=None, remark=""):
    """Move ``current`` (an ``allocated`` row) to a new occupant — release the
    old row and append a new one linked via ``replaces`` (§4.7, never overwrite).

    Cascades an Execution-Red swap onto the tasks it was driving, mirroring the
    pre-R5 behaviour.
    """
    if current.status != ResourceAllocation.Status.ALLOCATED:
        raise serializers.ValidationError("This allocation has already been released.")
    if is_tbd and current.slot != ResourceAllocation.Slot.WHITE:
        raise serializers.ValidationError("Only White may be left TBD.")
    if not is_tbd and user is None:
        raise serializers.ValidationError("Select a user, or mark White as TBD.")
    now = timezone.now()
    current.status = ResourceAllocation.Status.RELEASED
    current.released_on = now
    current.save(update_fields=["status", "released_on", "updated_at"])
    new_row = ResourceAllocation.objects.create(
        lead=current.lead,
        stage=current.stage,
        task=current.task,
        slot=current.slot,
        user=user,
        names=occupant_name(user, is_tbd),
        is_tbd=is_tbd,
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
def release(row):
    """Free a slot with no replacement (e.g. one White too many). Raises if the
    row is already released."""
    if row.status != ResourceAllocation.Status.ALLOCATED:
        raise serializers.ValidationError("This allocation has already been released.")
    row.status = ResourceAllocation.Status.RELEASED
    row.released_on = timezone.now()
    row.save(update_fields=["status", "released_on", "updated_at"])
    return row


def latest_execution_red(lead):
    """The Execution Red to assign ``execution_red`` tasks to (§7.5).

    The most recently allocated, still-``allocated`` Execution Red row on the
    lead — i.e. the current active engagement block's Red. None until the
    Resource Manager has filled one in.
    """
    row = (
        ResourceAllocation.objects.filter(
            lead=lead,
            slot=ResourceAllocation.Slot.EXECUTION_RED,
            status=ResourceAllocation.Status.ALLOCATED,
        )
        .order_by("-id")
        .first()
    )
    return row.user if row else None


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


@transaction.atomic
def submit(task, tdef, user):
    """Resource Manager / Default BD Person (D12) submits a staffed allocation
    task (§7.5): validates the mandatory slots, then completes the task, which
    opens the next workflow task assigned to the selected Execution Red.

    Mandatory: Execution Red (team tasks — the next task depends on it) and
    both Auditor slots (auditor tasks — carried over from their pre-R5 required
    text fields). Execution Brown/White stay optional (TBD/under-allocation are
    surfaced as indicators, not submit blockers). Raises ``ValidationError`` if
    the task is already submitted/closed or a mandatory slot is empty.
    """
    from . import engine  # lazy: engine imports this module at load time

    if task.status not in (Task.Status.OPEN, Task.Status.PENDING):
        raise serializers.ValidationError(
            "This allocation has already been submitted or has no open task."
        )
    slots = tdef.get("allocation_slots", [])
    mandatory = {
        ResourceAllocation.Slot.EXECUTION_RED,
        ResourceAllocation.Slot.AUDITOR_1,
        ResourceAllocation.Slot.AUDITOR_2,
    }
    for slot in slots:
        if slot in mandatory and not occupants(task, slot).exists():
            raise serializers.ValidationError(
                f"Select {ResourceAllocation.Slot(slot).label} before submitting."
            )
    if task.status == Task.Status.PENDING:
        task = engine.open_pending_task(task)
    return engine.complete_task(task, user)
