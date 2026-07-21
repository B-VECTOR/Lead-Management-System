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
If the offset date has *already* arrived when the predecessor closes (the
reference date falls inside the offset window — e.g. an engagement end date
under 2 months out for Task 13), the successor opens immediately instead of
sitting pending until the next scheduler run.

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
from .models import Checklist, Lead, ProjectDetails, Task, Workflow, WorkflowTriggerConfig


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
    Red the Resource Manager allocated for the current block (§7.5); None until
    an allocation is filled. *(The Phase-13 Brown/White-editor override was
    rescinded per PRD v3 / Tech Req v16 — Phase 14a, 2026-07-16.)*
    ``resource_manager`` allocation tasks stay unassigned — the Resource Manager
    reaches them via the role-scoped allocation screen.
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


def _active_trigger_config(workflow, task_no):
    """The active :class:`WorkflowTriggerConfig` gating ``task_no``, or None."""
    if workflow is None:
        return None
    return WorkflowTriggerConfig.objects.filter(
        workflow=workflow, task_no=task_no, is_active=True
    ).first()


def _trigger_already_due(lead, config, *, today=None):
    """True once ``today >= reference_date - offset_days`` for this trigger.

    False while the reference date hasn't been captured yet — the safe default
    is to stay ``pending`` until the scheduler can evaluate it.
    """
    ref = _reference_date(lead, config.reference_task_no, config.reference_field_key)
    if ref is None:
        return False
    today = today or timezone.now().date()
    return today >= ref - timezone.timedelta(days=config.offset_days)


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


def _validate_scalar(field, value):
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
        max_val = field.get("max")
        if max_val is not None and num > max_val:
            return f"Value cannot exceed {max_val}."
    elif ftype == "date":
        # Task-step date fields accept past dates (2026-07-20, per the user —
        # e.g. an engagement start date is often recorded after the fact), an
        # explicit exemption from the global "no past dates" rule (Tech Req §3).
        try:
            date.fromisoformat(str(value))
        except ValueError:
            return "Enter a valid date (YYYY-MM-DD)."
    elif ftype == "boolean":
        if value not in ("Yes", "No"):
            return "Select Yes or No."
    return None


def validate_extra_fields(tdef, values, *, require_mandatory):
    """Validate submitted field ``values`` against a task's schema.

    Always enforces the global numeric rules (§3) and date well-formedness on
    any provided value. Date fields — scalar and rowgroup cells alike — accept
    past dates (2026-07-20, per the user), an explicit exemption from the
    global "no past dates" rule. When ``require_mandatory`` is True (task
    closure) also enforces that every required / conditionally-required field
    is filled. Raises DRF ``ValidationError`` keyed by field so the API
    returns a 400 field map.
    """
    errors = {}
    for field in tdef.get("extra_fields", []):
        key = field["key"]
        # Error text always references the display label, never the internal
        # key (Tech Req §6 rule 7 v14); the dict stays keyed by field name so
        # the frontend can still attach each error to its input.
        label = field.get("label", key)
        value = values.get(key)
        if field.get("type") == "rowgroup":
            row_errors = _validate_rowgroup(field, value)
            if row_errors:
                errors[key] = row_errors
            continue
        if require_mandatory and _field_required(field, values) and _is_empty(value):
            errors[key] = f"“{label}” is required to complete the task."
            continue
        msg = _validate_scalar(field, value)
        if msg:
            errors[key] = f"“{label}”: {msg}"
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
    validate_extra_fields(tdef, task.extra_fields or {}, require_mandatory=True)


def _matched_route(tdef, values):
    """The first matching routing rule — ``{"open": [...], "skip": [...]}``.

    A rule's ``when`` is a single ``{field, equals}`` condition or a list of
    them — a list must match in full (AND semantics, Tech Req §4.11 v15).
    """
    for rule in tdef.get("routing", []):
        when = rule.get("when")
        conditions = [] if when is None else (when if isinstance(when, list) else [when])
        if all(values.get(c["field"]) == c["equals"] for c in conditions):
            return rule
    return {}


def _materialize_skips(lead, defs, task_nos):
    """Create ``skipped`` task rows for branch-routed-around steps (§4.4 v14).

    Tasks are otherwise created lazily, so a step a branch routes around would
    simply never exist — the ``skipped`` row makes the path taken explicit in
    task lists and the stepper. Only materialized when the lead has **no**
    instance of that ``task_no`` yet (a repeat/extension cycle that already ran
    the step keeps its closed rows rather than gaining a confusing skipped one).
    No checklist is instantiated — a skipped step is never worked.
    """
    skipped = []
    for no in task_nos:
        tdef = defs.get(no)
        if tdef is None or lead.tasks.filter(task_no=no).exists():
            continue
        skipped.append(
            Task.objects.create(
                lead=lead,
                task_no=no,
                task_name=tdef["name"],
                status=Task.Status.SKIPPED,
                is_allocation_task=tdef.get("is_allocation_task", False),
            )
        )
    return skipped


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
    # Cycle handover (§4.7 v14): closing Task 16 frees the superseded previous
    # cycle's Implementation/Extension row; only the current cycle stays Open.
    if oc.get("close_superseded_allocations"):
        resources.close_superseded_allocations(
            lead, oc["close_superseded_allocations"]
        )

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
        lead_status = oc["lead_status"]
        # A short-closed cycle stays Short Closed: the terminal closure task
        # would otherwise set the lead Complete, but short-close is kept as its
        # own terminal status (Phase 16 follow-up), so redirect it here.
        if lead_status == Lead.Status.COMPLETE and _is_short_closed(lead):
            lead_status = Lead.Status.SHORT_CLOSED
        lead.status = lead_status
        lead.save(update_fields=["status", "updated_at"])
        # On lead completion any still-pending (trigger-gated) tasks can never
        # open — mark them skipped so the path taken stays explicit (§4.4 v14).
        # Short Closed is terminal in the same way.
        if lead.status in (Lead.Status.COMPLETE, Lead.Status.SHORT_CLOSED):
            lead.tasks.filter(status=Task.Status.PENDING).update(
                status=Task.Status.SKIPPED
            )


@transaction.atomic
def complete_task(task, user):
    """Validate, close ``task``, apply its ``on_close`` effects, and create its
    successor(s). Returns the opened tasks.

    A successor that has an active :class:`WorkflowTriggerConfig` is created
    ``pending`` (the scheduler opens it on its offset date, Phase 5) unless
    that offset date has already arrived, in which case it opens immediately;
    every other successor opens immediately. ``elapsed_time`` is stamped on close,
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

    rule = _matched_route(tdef, task.extra_fields or {})
    # Steps the chosen branch routes around become explicit `skipped` rows
    # (§4.4 v14) — the rule's `skip` list is data in the workflow JSON.
    _materialize_skips(task.lead, defs, rule.get("skip", []))

    opened = []
    for target_no in rule.get("open", []):
        target_def = defs.get(target_no)
        if target_def is None:
            continue
        # A trigger-gated successor whose offset date has already arrived (the
        # reference date sits inside the offset window — e.g. an engagement end
        # date under 2 months out for Task 13) opens right now rather than
        # waiting for the scheduler; only a genuinely future open date pends.
        config = _active_trigger_config(wf, target_no)
        pending = config is not None and not _trigger_already_due(task.lead, config)
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


def _is_short_closed(lead):
    """True when the lead's current project cycle was short-closed — so the
    terminal closure task should end in Short Closed rather than Complete."""
    return lead.project_details.filter(is_current=True, short_closed=True).exists()


@transaction.atomic
def open_project_closure(lead, user=None, remark=""):
    """Short-close a project (§9.2 / §5.12): open the Project-Closure task.

    Used by the Resource Manager's Project Closure screen. Whatever else is
    currently active under the lead (open, held, or still pending on a date
    trigger) is swept to ``skipped`` first — short-closing means the project
    moves straight to closure regardless of which step it was on (Phase 16) —
    then the terminal closure task opens (assigned to the current Execution
    Red) so it can be closed to finish the engagement. The lead and its current
    ``project_details`` cycle are moved to the terminal **Short Closed** status
    (which is kept — it never flips to Complete when Task 17 later closes), and
    the cycle is stamped with who/when short-closed it plus the compulsory
    ``remark``, for the Lead-detail banner and the Project Closure screen. No-op
    — returns None — if the lead is already terminal (Complete/Short Closed) or
    a closure task is already open/pending.
    """
    if lead.status in (Lead.Status.COMPLETE, Lead.Status.SHORT_CLOSED):
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
    lead.tasks.filter(
        status__in=[Task.Status.OPEN, Task.Status.HOLD, Task.Status.PENDING]
    ).update(status=Task.Status.SKIPPED, short_closed=True)
    task = open_task(lead, closure)
    detail = lead.project_details.filter(is_current=True).first()
    if detail is not None:
        detail.short_closed = True
        detail.short_closed_at = timezone.now()
        detail.short_closed_by = user
        detail.short_close_remark = remark
        detail.status = ProjectDetails.Status.SHORT_CLOSED
        detail.save(
            update_fields=[
                "short_closed",
                "short_closed_at",
                "short_closed_by",
                "short_close_remark",
                "status",
            ]
        )
    lead.status = Lead.Status.SHORT_CLOSED
    lead.save(update_fields=["status", "updated_at"])
    return task


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


def pending_open_info(task):
    """When a ``pending`` trigger task will open, and the rule behind it.

    Returns ``{"open_date", "offset_days", "reference_task_no",
    "reference_field_key"}`` for a pending task whose reference date is known, or
    ``None`` (task not pending / no active config / reference date not captured
    yet). Surfaced on the task serializer so the frontend can show "Opens on
    <date>" instead of a pending task with no explanation (PRD §5.6)."""
    if task.status != Task.Status.PENDING:
        return None
    wf = active_workflow(task.lead.lead_type)
    if wf is None:
        return None
    config = WorkflowTriggerConfig.objects.filter(
        workflow=wf, task_no=task.task_no, is_active=True
    ).first()
    if config is None:
        return None
    ref = _reference_date(task.lead, config.reference_task_no, config.reference_field_key)
    if ref is None:
        return None
    return {
        "open_date": ref - timezone.timedelta(days=config.offset_days),
        "offset_days": config.offset_days,
        "reference_task_no": config.reference_task_no,
        "reference_field_key": config.reference_field_key,
    }


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
            if _trigger_already_due(task.lead, config, today=today):
                open_pending_task(task)
                opened.append(task)
    return opened
