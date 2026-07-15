"""BD workflow task engine (Tech Req §4.11, §5, §6; PRD §5.3–5.5, §5.16).

The engine is a *generic interpreter* of the workflow JSON (``leads/workflow_data.py``
seeded into ``Workflow.workflow``) — it hardcodes no task numbers or sequencing,
so the BD flow can be edited from admin and the future Mining flow added without
touching this code. Responsibilities:

- open the first task when a lead gets an owner (``start_workflow``);
- validate + persist a task's field values on every save (global rules, §3);
- close a task once its checklist is all-complete and mandatory fields are
  filled, then open the successor(s) per the routing/branch rules (``complete_task``).

Phase 5 adds the date-offset trigger behaviour: tasks with an active
``WorkflowTriggerConfig`` (2/6/11/13/15) are created ``pending`` when their
predecessor closes and opened later by the scheduler (``run_due_triggers``, run
from the ``open_due_tasks`` management command) once the offset date is reached.

Explicitly **out of scope here** (deferred to later phases, per PLAN §3):
- ``resource_allocation`` row creation on allocation-task open, and resolving
  ``execution_red``/Resource-Manager assignees — Phase 6. Those steps open
  **unassigned** here (the lead owner keeps view-only access, §6); a user can be
  put on them via the reassign action to walk the flow end-to-end.
- Task-12 → Hybernation / Task-17 → Complete lead-status side effects and
  Project-ID generation — Phase 6. Routing still advances correctly.
"""

from datetime import date

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import holds, projects, resources
from .models import Checklist, Lead, Task, Workflow, WorkflowTriggerConfig


def active_workflow(lead_type):
    """The active :class:`Workflow` for ``lead_type`` (newest wins), or None."""
    return (
        Workflow.objects.filter(type=lead_type, status=Workflow.Status.ACTIVE)
        .order_by("-updated_at")
        .first()
    )


def _task_defs(workflow_json):
    """Map ``task_no -> task dict`` from a stored workflow definition."""
    return {t["task_no"]: t for t in (workflow_json or {}).get("tasks", [])}


def task_defs_for(lead_type):
    """Public ``task_no -> task dict`` map for a lead type's active workflow."""
    wf = active_workflow(lead_type)
    return _task_defs(wf.workflow) if wf else {}


def _resolve_assignee(lead, tdef):
    """Who the step opens assigned to.

    ``default_bd_person`` → the lead's owner. ``execution_red`` → the Execution
    Red the Resource Manager set on the lead's current allocation row (Phase 6,
    §7.5); None until an allocation is filled. ``resource_manager`` allocation
    tasks stay unassigned — the Resource Manager reaches them via the role-scoped
    allocation screen, not a per-user assignment.
    """
    assignee = tdef.get("assignee")
    if assignee == "default_bd_person":
        return lead.assigned_to
    if assignee == "execution_red":
        return resources.latest_execution_red(lead)
    return None


def open_task(lead, tdef, *, status=Task.Status.OPEN):
    """Create one task instance for ``tdef`` and instantiate its checklist.

    Opens it immediately (``opened_at`` stamped) unless ``status`` is
    ``pending`` — a trigger task waiting for the scheduler, which carries no
    ``opened_at`` until :func:`open_pending_task` fires.
    """
    task = Task.objects.create(
        lead=lead,
        task_no=tdef["task_no"],
        task_name=tdef["name"],
        assigned_to=_resolve_assignee(lead, tdef),
        status=status,
        is_allocation_task=tdef.get("is_allocation_task", False),
        opened_at=timezone.now() if status == Task.Status.OPEN else None,
    )
    items = [
        Checklist(task=task, item_key=c["key"], item_label=c["label"])
        for c in tdef.get("checklist", [])
    ]
    if items:
        Checklist.objects.bulk_create(items)
    # An allocation task that opens immediately gets its resource_allocation row
    # now (§7.2); trigger-gated ones (status=pending) get it when the scheduler
    # opens them, via open_pending_task.
    resources.ensure_allocation_row(task, tdef)
    return task


def open_pending_task(task):
    """Flip a ``pending`` trigger task to ``open`` (scheduler action).

    Idempotent — a no-op unless the task is still pending. Resolves the
    assignee at open time (still None for resource-manager steps until Phase 6).
    """
    if task.status != Task.Status.PENDING:
        return task
    tdef = task_defs_for(task.lead.lead_type).get(task.task_no, {})
    task.status = Task.Status.OPEN
    task.opened_at = timezone.now()
    task.assigned_to = _resolve_assignee(task.lead, tdef)
    task.save(update_fields=["status", "opened_at", "assigned_to", "updated_at"])
    resources.ensure_allocation_row(task, tdef)
    return task


def _has_active_trigger(workflow, task_no):
    """True if ``task_no`` opens on a date offset rather than immediately."""
    if workflow is None:
        return False
    return WorkflowTriggerConfig.objects.filter(
        workflow=workflow, task_no=task_no, is_active=True
    ).exists()


@transaction.atomic
def start_workflow(lead):
    """Open Task 1 for a newly-owned lead (Tech Req §4.3.1).

    Idempotent and guarded: only for an active BD lead that has an owner and no
    tasks yet. Returns the opened Task, or ``None`` if nothing was started.
    """
    if lead.lead_type != Lead.LeadType.BD:
        return None
    if not lead.assigned_to_id or lead.status != Lead.Status.IN_PROGRESS:
        return None
    if lead.tasks.exists():
        return None
    wf = active_workflow(lead.lead_type)
    if wf is None:
        return None
    defs = _task_defs(wf.workflow)
    first = defs.get(1)
    if first is None:
        return None
    return open_task(lead, first)


# --- Field validation (global rules, Tech Req §3) --------------------------

def _is_empty(value):
    return value is None or value == "" or value == []


def _field_required(field, values):
    if field.get("required"):
        return True
    cond = field.get("required_when")
    if cond:
        return values.get(cond["field"]) == cond["equals"]
    return False


# Field whose past-date floor is the lead's creation date rather than today
# (Phase 11, per the user): the "expected start date of next stage" may be
# back-dated as far as the lead was created — a stage can't start before the
# lead existed, but earlier-than-today is allowed for it. Every other date field
# keeps the global "no past dates" (before today) rule (Tech Req §3).
LEAD_CREATED_FLOOR_FIELDS = {"expected_start_date"}


def _date_floor(field, lead_created_date):
    if field.get("key") in LEAD_CREATED_FLOOR_FIELDS and lead_created_date is not None:
        return lead_created_date
    return timezone.now().date()


def _validate_scalar(field, value, *, lead_created_date=None):
    """Global-rule check for one scalar value; returns an error string or None."""
    if _is_empty(value):
        return None
    ftype = field.get("type", "text")
    if ftype == "number":
        try:
            num = float(value)
        except (TypeError, ValueError):
            return "Enter a valid number."
        if num < 0:
            return "Negative values are not allowed."
    elif ftype == "date":
        try:
            parsed = date.fromisoformat(str(value))
        except ValueError:
            return "Enter a valid date (YYYY-MM-DD)."
        floor = _date_floor(field, lead_created_date)
        if parsed < floor:
            if floor < timezone.now().date():
                return f"Date cannot be before the lead was created ({floor.isoformat()})."
            return "Past dates are not allowed."
    elif ftype == "boolean":
        if value not in ("Yes", "No"):
            return "Select Yes or No."
    return None


def validate_extra_fields(tdef, values, *, require_mandatory, lead_created_date=None):
    """Validate submitted field ``values`` against a task's schema.

    Always enforces the global numeric/date rules (§3) on any provided value.
    When ``require_mandatory`` is True (task closure) also enforces that every
    required / conditionally-required field is filled. ``lead_created_date`` (the
    owning lead's creation date) is the floor for the per-field exemption in
    :data:`LEAD_CREATED_FLOOR_FIELDS`. Raises DRF ``ValidationError`` keyed by
    field so the API returns a 400 field map.
    """
    errors = {}
    for field in tdef.get("extra_fields", []):
        key = field["key"]
        value = values.get(key)
        if field.get("type") == "rowgroup":
            row_errors = _validate_rowgroup(field, value)
            if row_errors:
                errors[key] = row_errors
            continue
        if require_mandatory and _field_required(field, values) and _is_empty(value):
            errors[key] = "This field is required to complete the task."
            continue
        msg = _validate_scalar(field, value, lead_created_date=lead_created_date)
        if msg:
            errors[key] = msg
    if errors:
        # Keyed by field name; callers decide whether to nest under a key.
        raise serializers.ValidationError(errors)


def _validate_rowgroup(field, value):
    """Validate each provided cell of a repeatable row-group; list of errors."""
    if _is_empty(value):
        return None
    if not isinstance(value, list):
        return "Expected a list of rows."
    cols = {c["key"]: c for c in field.get("columns", [])}
    errors = []
    for i, row in enumerate(value):
        if not isinstance(row, dict):
            errors.append({"row": i, "error": "Invalid row."})
            continue
        for ckey, cval in row.items():
            col = cols.get(ckey)
            if not col:
                continue
            msg = _validate_scalar(col, cval)
            if msg:
                errors.append({"row": i, "field": ckey, "error": msg})
    return errors or None


# --- Closure + routing -----------------------------------------------------

def _checklist_incomplete(task):
    return task.checklist_items.exclude(status=Checklist.Status.COMPLETE).exists()


def assert_closable(task, tdef):
    """Raise if the task cannot be closed (Tech Req §6 / PRD §5.5 rule 1)."""
    if _checklist_incomplete(task):
        raise serializers.ValidationError(
            "All checklist items must be complete before closing this task."
        )
    validate_extra_fields(
        tdef,
        task.extra_fields or {},
        require_mandatory=True,
        lead_created_date=task.lead.created_at.date(),
    )


def _route_targets(tdef, values):
    """The successor ``task_no``\\s per the first matching routing rule."""
    for rule in tdef.get("routing", []):
        when = rule.get("when")
        if when is None or values.get(when["field"]) == when["equals"]:
            return rule.get("open", [])
    return []


def _apply_on_close(task, tdef, user):
    """Run the task's Phase-6 ``on_close`` side effects (Tech Req §4.7, §4.8, §13).

    Generic — the concrete task numbers live only in the workflow JSON. Handles
    allocation auto-close, Project-ID generation/regeneration + project_details
    cycling, and system-only lead-status transitions (Hybernation/Complete).
    """
    oc = tdef.get("on_close") or {}
    if not oc:
        return
    lead = task.lead

    if oc.get("close_allocations"):
        resources.close_allocations(lead, oc["close_allocations"])

    pid = oc.get("project_id")
    pd = oc.get("project_details")
    alloc_type = pd.get("allocation_type") if isinstance(pd, dict) else None
    allocation = resources.allocation_for_type(lead, alloc_type) if alloc_type else None
    if pid == "generate":
        projects.generate_first_project_id(lead, user, allocation=allocation)
    elif pid == "regenerate":
        projects.regenerate_project_id(lead, user, allocation=allocation)
    if pd == "complete":
        projects.complete_current_cycle(lead)

    if oc.get("lead_status"):
        lead.status = oc["lead_status"]
        lead.save(update_fields=["status", "updated_at"])


@transaction.atomic
def complete_task(task, user):
    """Validate, close ``task``, apply its ``on_close`` effects, and create its
    successor(s). Returns the opened tasks.

    A successor that has an active :class:`WorkflowTriggerConfig` is created
    ``pending`` (the scheduler opens it on its offset date, Phase 5); every
    other successor opens immediately. ``elapsed_time`` is stamped on close,
    net of any hold intervals (§4.9). The Phase-6 side effects on Tasks
    4/9/12/16/17 (allocation auto-close, Project-ID generation, lead-status
    transitions) are applied via :func:`_apply_on_close`.
    """
    if task.status != Task.Status.OPEN:
        raise serializers.ValidationError("Only an open task can be completed.")
    wf = active_workflow(task.lead.lead_type)
    if wf is None:
        raise serializers.ValidationError("No active workflow for this lead type.")
    defs = _task_defs(wf.workflow)
    tdef = defs.get(task.task_no)
    if tdef is None:
        raise serializers.ValidationError("This task is not part of the active workflow.")

    assert_closable(task, tdef)

    task.status = Task.Status.CLOSED
    task.closed_at = timezone.now()
    task.elapsed_time = holds.compute_elapsed_time(task, closed_at=task.closed_at)
    task.save(update_fields=["status", "closed_at", "elapsed_time", "updated_at"])

    # Side effects (Project ID, allocation close, lead status) before routing so
    # the successor's assignee resolution / trigger checks see the new state.
    _apply_on_close(task, tdef, user)

    opened = []
    for target_no in _route_targets(tdef, task.extra_fields or {}):
        target_def = defs.get(target_no)
        if target_def is None:
            continue
        pending = _has_active_trigger(wf, target_no)
        status = Task.Status.PENDING if pending else Task.Status.OPEN
        opened.append(open_task(task.lead, target_def, status=status))
    return opened


def _closure_task_def(defs):
    """The workflow's terminal Project-Closure task (the one whose ``on_close``
    sets the lead to ``Complete``) — found by rule, not by task number."""
    for tdef in defs.values():
        if (tdef.get("on_close") or {}).get("lead_status") == Lead.Status.COMPLETE:
            return tdef
    return None


@transaction.atomic
def open_project_closure(lead, user=None):
    """Short-close a project (§9.2 / §5.12): open the Project-Closure task.

    Used by the Resource Manager's Project Closure screen. Opens the terminal
    closure task (assigned to the current Execution Red) so it can be closed to
    finish the engagement. No-op — returns None — if the lead is already
    complete or a closure task is already open/pending.
    """
    if lead.status == Lead.Status.COMPLETE:
        return None
    defs = task_defs_for(lead.lead_type)
    closure = _closure_task_def(defs)
    if closure is None:
        return None
    already = lead.tasks.filter(
        task_no=closure["task_no"],
        status__in=[Task.Status.OPEN, Task.Status.PENDING, Task.Status.HOLD],
    ).exists()
    if already:
        return None
    return open_task(lead, closure)


# --- Trigger scheduler (Tech Req §4.12 / PRD §5.6) -------------------------

def _reference_date(lead, reference_task_no, field_key):
    """The reference date for a trigger: ``field_key`` on the most recent
    *closed* instance of ``reference_task_no`` under ``lead``. None if absent.
    """
    ref_task = (
        lead.tasks.filter(task_no=reference_task_no, status=Task.Status.CLOSED)
        .order_by("-closed_at", "-id")
        .first()
    )
    if ref_task is None:
        return None
    raw = (ref_task.extra_fields or {}).get(field_key)
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        return None


def run_due_triggers(*, today=None):
    """Open every pending trigger task whose offset date has arrived.

    Evaluates active :class:`WorkflowTriggerConfig` rules against pending tasks
    on active leads and opens each one where
    ``today >= reference_date - offset_days`` (Tech Req §4.12; same-day
    opening). Skips held/dropped/completed leads. Returns the list of opened
    tasks. Idempotent — safe to run as often as the scheduler needs.

    Both ``In Progress`` and ``Hybernation`` leads are eligible: Task 12 puts a
    lead into Hybernation (§4.3.2), yet its Task-13 extension trigger still has
    to fire ~2 months before the engagement end date while it sits there.
    """
    today = today or timezone.now().date()
    active_statuses = [Lead.Status.IN_PROGRESS, Lead.Status.HYBERNATION]
    opened = []
    for config in WorkflowTriggerConfig.objects.filter(is_active=True).select_related("workflow"):
        pending = Task.objects.filter(
            task_no=config.task_no,
            status=Task.Status.PENDING,
            lead__lead_type=config.workflow.type,
            lead__status__in=active_statuses,
        ).select_related("lead")
        for task in pending:
            ref = _reference_date(task.lead, config.reference_task_no, config.reference_field_key)
            if ref is None:
                continue
            if today >= ref - timezone.timedelta(days=config.offset_days):
                open_pending_task(task)
                opened.append(task)
    return opened
