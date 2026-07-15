"""Resource-allocation service (Tech Req §4.7, §7; PRD §5.7).

Encapsulates everything the workflow does with ``resource_allocation`` rows so
the engine stays a generic JSON interpreter:

- **On allocation-task open** (2/6/11/15): insert a ``Pending`` row of the
  task's ``allocation_type``, seeding ``man_power_required`` from the upstream
  stage's manpower fields (``manpower_source`` hint). ``ensure_allocation_row``.
- **execution_red resolution:** the successor of an allocation task — and every
  ``execution_red``-assigned task in that block — is worked by the Execution Red
  the Resource Manager picked. ``latest_execution_red`` reads it off the lead's
  current allocation row so the engine needs no task numbers.
- **Submit** (Resource Manager fills + submits the form): flip the row to
  ``Open`` and close the allocation task, which opens the next task assigned to
  that Execution Red (§7.5). ``submit_allocation``.
- **Auto-close:** free resources when their engagement ends, per the ``on_close``
  ``close_allocations`` hints (2HR@Task 4, SNT@Task 9, Impl/Ext@Task 17).
  ``close_allocations``.

The engine imports this module; this module imports the engine lazily (inside
``submit_allocation``) to avoid an import cycle.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from . import events
from .models import Notification, ResourceAllocation, Task

RESOURCE_MANAGER_GROUP = "resource_manager"


def _notify_resource_managers(allocation):
    """Tell every Resource Manager a new allocation is waiting (PRD §5.7).

    Allocation tasks open unassigned, so no single user is notified by the
    normal task-open path — the Resource Manager reaches them via the
    role-scoped ``/resources`` screen. Best-effort/additive: notify all active
    Resource Managers so a freshly-created allocation is not missed.
    """
    User = get_user_model()
    lead = allocation.lead
    managers = User.objects.filter(
        groups__name=RESOURCE_MANAGER_GROUP, is_active=True
    ).distinct()
    for rm in managers:
        events.notify(
            rm,
            Notification.Type.TASK_OPENED,
            f"Resource allocation needed for “{lead.company_name} — {lead.project_name}” ({allocation.type}).",
            events.lead_link(lead),
        )


def _num(value):
    """Coerce a stored numeric field value to int (≥0), else 0."""
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return 0
    return max(n, 0)


def _manpower_split(lead, source):
    """Read the Brown/White man-power split off the most-recent closed source
    task, returning ``(brown, white, total)``.

    The ``manpower_source`` hint lists the field keys (``manpower_brown`` /
    ``manpower_white``); the key name carries the belt so the split is preserved
    for the Resource Manager rather than collapsed into a single total.
    """
    if not source:
        return 0, 0, 0
    src_task = (
        lead.tasks.filter(task_no=source.get("task_no"), status=Task.Status.CLOSED)
        .order_by("-closed_at", "-id")
        .first()
    )
    if src_task is None:
        return 0, 0, 0
    values = src_task.extra_fields or {}
    brown = white = 0
    for key in source.get("fields", []):
        n = _num(values.get(key))
        if "white" in key.lower():
            white += n
        else:
            brown += n
    return brown, white, brown + white


def ensure_allocation_row(task, tdef):
    """Create the ``Pending`` allocation row for an allocation task.

    Created as soon as the allocation task is instantiated — whether it opens
    immediately (``open``) or is trigger-gated (``pending``) — so the Resource
    Manager sees the pending allocation on ``/resources`` right after the
    upstream task closes and can staff it without waiting for the trigger date
    (the Resource Manager unblocks the next task by submitting). Idempotent
    (one row per task) so re-opening or the scheduler flip cannot double-insert.
    """
    if not tdef.get("is_allocation_task"):
        return None
    if task.status not in (Task.Status.OPEN, Task.Status.PENDING):
        return None
    if task.resource_allocations.exists():
        return None
    brown, white, total = _manpower_split(task.lead, tdef.get("manpower_source"))
    row = ResourceAllocation.objects.create(
        lead=task.lead,
        allocation_task=task,
        type=tdef["allocation_type"],
        status=ResourceAllocation.Status.PENDING,
        man_power_required=total,
        man_power_brown=brown,
        man_power_white=white,
    )
    _notify_resource_managers(row)
    return row


def latest_execution_red(lead):
    """The Execution Red to assign ``execution_red`` tasks to (Phase 6).

    The most recently created allocation row that has an Execution Red set and
    hasn't closed — i.e. the current active engagement block's Execution Red.
    None until the Resource Manager has filled one in.
    """
    row = (
        lead.resource_allocations.filter(execution_red__isnull=False)
        .exclude(status=ResourceAllocation.Status.CLOSED)
        .order_by("-id")
        .first()
    )
    return row.execution_red if row else None


def allocation_for_type(lead, alloc_type):
    """The most recent non-closed allocation row of ``alloc_type`` (history link)."""
    return (
        lead.resource_allocations.filter(type=alloc_type)
        .exclude(status=ResourceAllocation.Status.CLOSED)
        .order_by("-id")
        .first()
    )


@transaction.atomic
def close_allocations(lead, types):
    """Auto-close every open/pending allocation row whose type is in ``types``."""
    (
        lead.resource_allocations.filter(type__in=types)
        .exclude(status=ResourceAllocation.Status.CLOSED)
        .update(status=ResourceAllocation.Status.CLOSED, closed_at=timezone.now())
    )


@transaction.atomic
def submit_allocation(allocation, user):
    """Resource Manager submits a filled allocation form (§7.5).

    Marks the row ``Open`` and completes its allocation task, which opens the
    next workflow task assigned to the selected Execution Red. A trigger-gated
    (``pending``) allocation task is opened first, so the RM can staff it before
    its trigger date. Returns the tasks opened by the closure. Raises
    ``ValidationError`` if the row's task is already submitted/closed or missing.
    """
    from . import engine  # lazy: engine imports this module at load time

    task = allocation.allocation_task
    if task is None or task.status not in (Task.Status.OPEN, Task.Status.PENDING):
        from rest_framework import serializers

        raise serializers.ValidationError(
            "This allocation has already been submitted or has no open task."
        )
    # If the RM staffs it before its trigger date, open the pending task first
    # (a deliberate RM action) so it can be completed and open the next task.
    if task.status == Task.Status.PENDING:
        task = engine.open_pending_task(task)
    if allocation.status == ResourceAllocation.Status.PENDING:
        allocation.status = ResourceAllocation.Status.OPEN
        allocation.save(update_fields=["status"])
    return engine.complete_task(task, user)
