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

from django.db import transaction
from django.utils import timezone

from .models import ResourceAllocation, Task


def _num(value):
    """Coerce a stored numeric field value to int (≥0), else 0."""
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return 0
    return max(n, 0)


def _manpower_required(lead, source):
    """Sum the ``manpower_source`` fields off the most-recent closed source task."""
    if not source:
        return 0
    src_task = (
        lead.tasks.filter(task_no=source.get("task_no"), status=Task.Status.CLOSED)
        .order_by("-closed_at", "-id")
        .first()
    )
    if src_task is None:
        return 0
    values = src_task.extra_fields or {}
    return sum(_num(values.get(f)) for f in source.get("fields", []))


def ensure_allocation_row(task, tdef):
    """Create the ``Pending`` allocation row for a freshly-opened allocation task.

    No-op unless ``task`` is an open allocation task with no row yet (idempotent,
    so re-opening or the scheduler flip cannot double-insert).
    """
    if not tdef.get("is_allocation_task"):
        return None
    if task.status != Task.Status.OPEN:
        return None
    if task.resource_allocations.exists():
        return None
    return ResourceAllocation.objects.create(
        lead=task.lead,
        allocation_task=task,
        type=tdef["allocation_type"],
        status=ResourceAllocation.Status.PENDING,
        man_power_required=_manpower_required(task.lead, tdef.get("manpower_source")),
    )


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
    next workflow task assigned to the selected Execution Red. Returns the
    tasks opened by the closure. Raises ``ValidationError`` if the row's task
    is not open (already submitted / not an allocation task).
    """
    from . import engine  # lazy: engine imports this module at load time

    task = allocation.allocation_task
    if task is None or task.status != Task.Status.OPEN:
        from rest_framework import serializers

        raise serializers.ValidationError(
            "This allocation has already been submitted or has no open task."
        )
    if allocation.status == ResourceAllocation.Status.PENDING:
        allocation.status = ResourceAllocation.Status.OPEN
        allocation.save(update_fields=["status"])
    return engine.complete_task(task, user)
