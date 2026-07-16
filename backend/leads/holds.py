"""Lead / task hold-unhold service + elapsed-time computation (Tech Req §4.9, §6; PRD §5.8).

Holding pauses work; every transition is recorded as a :class:`LeadHold` /
:class:`TaskHold` interval so a task's *active* time can be computed by
subtracting held duration from its total open→closed span:

    elapsed_time = (closed_at - opened_at) - Σ(unhold_at - hold_at)

Rules encoded here:

- **Lead hold** puts the lead into ``On Hold`` and cascades to every currently
  *open* task (each gets its own ``TaskHold``). **Lead unhold** restores the
  lead to ``In Progress`` and reactivates every task it left on hold.
- **Task hold** pauses a single open task; **task unhold** re-opens it.
- A held task is non-editable (``Task.is_editable`` is False for ``hold``), and
  cannot be completed — it must be unheld first, so at closure every interval is
  already closed.

The functions are idempotent: holding an already-held lead/task, or unholding
one that isn't held, is a no-op.
"""

from django.db import transaction
from django.utils import timezone

from .models import Lead, LeadHold, Task, TaskHold


def _open_hold(holds_manager):
    """The still-active hold interval on a related manager, or None."""
    return holds_manager.filter(unhold_at__isnull=True).order_by("-hold_at").first()


@transaction.atomic
def hold_task(task, user, *, when=None, reason=""):
    """Pause one open task. Returns the created ``TaskHold`` or None (no-op).

    ``reason`` is stored on the interval so the hold trail keeps why each pause
    was taken across repeated cycles (Phase 13).
    """
    if task.status != Task.Status.OPEN:
        return None
    when = when or timezone.now()
    hold = TaskHold.objects.create(
        task=task, hold_by=user, hold_at=when, reason=reason or ""
    )
    task.status = Task.Status.HOLD
    task.save(update_fields=["status", "updated_at"])
    return hold


@transaction.atomic
def unhold_task(task, user, *, when=None, reason=""):
    """Resume one held task. Returns the closed ``TaskHold`` or None (no-op).

    ``reason`` (optional, from the unhold popup — Tech Req §4.9 v16) is stored
    on the interval alongside the hold-side reason.
    """
    if task.status != Task.Status.HOLD:
        return None
    when = when or timezone.now()
    hold = _open_hold(task.holds)
    if hold is not None:
        hold.unhold_at = when
        hold.unhold_by = user
        hold.unhold_reason = reason or ""
        hold.save(update_fields=["unhold_at", "unhold_by", "unhold_reason"])
    task.status = Task.Status.OPEN
    task.save(update_fields=["status", "updated_at"])
    return hold


@transaction.atomic
def hold_lead(lead, user, *, when=None, reason=""):
    """Put a lead On Hold and cascade to its open tasks (Tech Req §6).

    Only meaningful for an ``In Progress`` lead; idempotent otherwise. Returns
    the created ``LeadHold`` or None. ``reason`` is recorded on the lead hold and
    propagated to each cascaded task hold so the trail explains the pause.
    """
    if lead.status != Lead.Status.IN_PROGRESS:
        return None
    when = when or timezone.now()
    lead_hold = LeadHold.objects.create(
        lead=lead, hold_by=user, hold_at=when, reason=reason or ""
    )
    lead.status = Lead.Status.ON_HOLD
    lead.save(update_fields=["status", "updated_at"])
    for task in lead.tasks.filter(status=Task.Status.OPEN):
        hold_task(task, user, when=when, reason=reason)
    return lead_hold


@transaction.atomic
def unhold_lead(lead, user, *, when=None, reason=""):
    """Take a lead off hold and reactivate the tasks it left on hold.

    Restores the lead to ``In Progress`` and unholds every task currently on
    hold under it (matching "unholding the lead restores those tasks", PRD §5.8).
    ``reason`` (optional, v16) is stored on the lead's interval and copied onto
    every task unhold the cascade releases. Idempotent. Returns the closed
    ``LeadHold`` or None.
    """
    if lead.status != Lead.Status.ON_HOLD:
        return None
    when = when or timezone.now()
    lead_hold = _open_hold(lead.holds)
    if lead_hold is not None:
        lead_hold.unhold_at = when
        lead_hold.unhold_by = user
        lead_hold.unhold_reason = reason or ""
        lead_hold.save(update_fields=["unhold_at", "unhold_by", "unhold_reason"])
    lead.status = Lead.Status.IN_PROGRESS
    lead.save(update_fields=["status", "updated_at"])
    for task in lead.tasks.filter(status=Task.Status.HOLD):
        unhold_task(task, user, when=when, reason=reason)
    return lead_hold


@transaction.atomic
def drop_lead(lead, user, *, remark=""):
    """Drop (cancel) a lead via the drop popup (Tech Req §4.3.2 v16).

    Stores the optional ``remark`` on the lead and moves every open/held task
    to the ``dropped`` status. Only an In Progress / On Hold lead can be
    dropped; returns the lead, or None when the drop is a no-op (already
    dropped, or a system-final status).
    """
    if lead.status not in (Lead.Status.IN_PROGRESS, Lead.Status.ON_HOLD):
        return None
    lead.status = Lead.Status.DROPPED
    lead.drop_remark = remark or ""
    lead.save(update_fields=["status", "drop_remark", "updated_at"])
    lead.tasks.filter(status__in=[Task.Status.OPEN, Task.Status.HOLD]).update(
        status=Task.Status.DROPPED
    )
    return lead


def compute_elapsed_time(task, *, closed_at=None):
    """Active (non-hold) duration of a task: total span minus held intervals.

    ``elapsed_time = (closed_at - opened_at) - Σ(unhold_at - hold_at)`` (§4.9).
    Returns a ``timedelta`` or None if the task never opened. An interval still
    open at computation time is measured up to ``closed_at``/now (defensive; a
    held task cannot normally be closed).
    """
    if task.opened_at is None:
        return None
    end = closed_at or task.closed_at or timezone.now()
    held = timezone.timedelta()
    for hold in task.holds.all():
        stop = hold.unhold_at or end
        held += stop - hold.hold_at
    return (end - task.opened_at) - held
