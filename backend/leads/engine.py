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
- Lead-status side effects and Project-ID generation — Phase 6 (old model);
  the 28-task rebuild redoes these in R3/R4. Routing still advances correctly.
"""

import re
from datetime import date

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import events, holds, projects, resources
from .models import (
    Checklist,
    Lead,
    LeadStage,
    Notification,
    Task,
    Workflow,
    WorkflowTriggerConfig,
)

# Extension-loop stage codes (E1, E2, …) — a task's literal ``stage`` value in
# the workflow JSON ("E1" on Tasks 22–26) is a placeholder; the *actual* stage
# for a given pass is resolved dynamically (R6, §4.3.1) — see ``_attach_stage``.
_EXTENSION_STAGE_RE = re.compile(r"^E\d+$")


def active_workflow(lead_type):
    """The active :class:`Workflow` for ``lead_type`` (newest wins), or None.

    v4.0/v17.0 (R3) uses a **single unified 28-task graph** seeded as ``type=BD``;
    Mining and Extension leads run the same graph, entered at a different task via
    the per-flow ``entry`` list. So if no workflow is seeded for the lead's own
    type, fall back to the BD workflow (DD1). A type-specific workflow, if one is
    ever seeded, still wins.
    """
    wf = (
        Workflow.objects.filter(type=lead_type, status=Workflow.Status.ACTIVE)
        .order_by("-updated_at")
        .first()
    )
    if wf is not None or lead_type == Lead.LeadType.BD:
        return wf
    return (
        Workflow.objects.filter(type=Lead.LeadType.BD, status=Workflow.Status.ACTIVE)
        .order_by("-updated_at")
        .first()
    )


def _flow_for(lead, wf):
    """The flow config (``{entry, skip, edges}``) for a lead (§4.3.4 / D6).

    Extension-type leads use the ``EXTENSION`` entry (Task 22); BD/Mining leads
    use their ``flow_of_tasks`` code (default ``DEFAULT``).

    A BD/Mining lead with **no** ``flow_of_tasks`` yet takes the
    ``FLOW_SELECTION`` entry instead (R19): only a lead spawned by the Task-21
    go-ahead reaches here blank — the API requires a flow on every
    manually-created BD/Mining lead — and its path is chosen months later, on
    the pre-flow selection task itself.
    """
    flows = (wf.workflow or {}).get("flows", {})
    if lead.lead_type == Lead.LeadType.EXTENSION:
        return flows.get("EXTENSION", {"entry": [22]})
    if not lead.flow_of_tasks and "FLOW_SELECTION" in flows:
        return flows["FLOW_SELECTION"]
    key = lead.flow_of_tasks or "DEFAULT"
    return flows.get(key, flows.get("DEFAULT", {"entry": [1]}))


def _task_defs(workflow_json):
    """Map ``task_no -> task dict`` from a stored workflow definition."""
    return {t["task_no"]: t for t in (workflow_json or {}).get("tasks", [])}


def task_defs_for(lead_type):
    """Public ``task_no -> task dict`` map for a lead type's active workflow."""
    wf = active_workflow(lead_type)
    return _task_defs(wf.workflow) if wf else {}


def _assignee_code(lead, tdef):
    """The ``assignee`` code to use for ``tdef``, applying its ``assignee_rules``.

    R9 (DD-R9-3): a task may carry ordered overrides matched against an earlier
    task's stored answer — ``{"when": {"task_no", "field", "equals"}, "assignee"}``
    — so a branch like "Task 3 opens to the Default BD Person when Task 2 said no
    manpower support is needed" stays workflow **data**. First match wins; no
    match falls through to the plain ``assignee``.
    """
    for rule in tdef.get("assignee_rules", []):
        cond = rule.get("when") or {}
        answer = _reference_answer(lead, cond.get("task_no"), cond.get("field"))
        if answer is not None and answer == cond.get("equals"):
            return rule.get("assignee")
    return tdef.get("assignee")


def _resolve_assignee(lead, tdef):
    """Who the step opens assigned to.

    ``default_bd_person`` → the lead's owner. ``execution_red`` → the Execution
    Red currently allocated on the lead (§7.5, and since R9 the last Red it ever
    had — see :func:`resources.latest_execution_red`). ``resource_manager`` /
    ``finance`` tasks stay unassigned — reached via the role-scoped allocation
    screen / Accounts queue.

    The code itself may be overridden per-lead by ``assignee_rules``
    (:func:`_assignee_code`). ``fallback_assignee`` (R3) is used when the primary
    resolves to None.
    """
    assignee = _assignee_code(lead, tdef)
    resolved = None
    if assignee == "default_bd_person":
        resolved = lead.assigned_to
    elif assignee == "execution_red":
        resolved = resources.latest_execution_red(lead)
    if resolved is None and tdef.get("fallback_assignee") == "default_bd_person":
        resolved = lead.assigned_to
    return resolved


def _attach_stage(lead, tdef):
    """Get-or-open the task's :class:`LeadStage` — returns the stage row or
    None. Idempotent via :func:`projects.ensure_stage`, so opening several tasks
    of one stage reuses a single stage row.

    R6: Tasks 22–26's ``stage`` is a literal ``"E1"`` in the JSON, but the
    *actual* extension-loop stage for a given pass is resolved dynamically via
    :func:`projects.ensure_extension_stage` — Task 22 reuses the loop's
    currently-open stage (or starts the next one, ``E1``/``E2``/…, the first
    time or after a loop-back), Tasks 23–26 always reuse whichever one Task 22
    just resolved. This keeps the loop counter (§4.3.1) out of workflow data.
    """
    code = tdef.get("stage")
    if not code:
        return None
    if _EXTENSION_STAGE_RE.match(code):
        return projects.ensure_extension_stage(lead)
    return projects.ensure_stage(lead, code)


def open_task(lead, tdef, *, status=Task.Status.OPEN):
    """Create one task instance for ``tdef`` and instantiate its checklist.

    Opens it immediately (``task_start_dt`` stamped, stage attached) unless
    ``status`` is ``pending`` — a trigger task waiting for the scheduler, which
    carries no ``task_start_dt`` / stage until :func:`open_pending_task` fires (a
    pending task hasn't genuinely started, so its stage isn't opened yet).
    """
    stage = _attach_stage(lead, tdef) if status == Task.Status.OPEN else None
    task = Task.objects.create(
        lead=lead,
        task_no=tdef["task_no"],
        task_name=tdef["name"],
        stage=stage,
        project_id=stage.project_id if stage is not None else "",
        assigned_to=_resolve_assignee(lead, tdef),
        status=status,
        is_allocation_task=tdef.get("is_allocation_task", False),
        is_finance_gate=tdef.get("is_finance_gate", False),
        is_hanging_task=tdef.get("is_hanging_task", False),
        task_start_dt=timezone.now() if status == Task.Status.OPEN else None,
    )
    items = [
        Checklist(task=task, item_key=c["key"], item_label=c["label"])
        for c in tdef.get("checklist", [])
    ]
    if items:
        Checklist.objects.bulk_create(items)
    # R5: an allocation task no longer gets a row created upfront — the
    # Resource Manager / Default BD Person (D12) fills each slot as they
    # decide (resources.allocate). Just ping the Resource Managers it's
    # waiting, once it has genuinely opened (not for a trigger-gated ``pending``
    # instance — open_pending_task re-notifies when it actually opens).
    if status == Task.Status.OPEN:
        if tdef.get("is_allocation_task"):
            # R9: the Execution Red carries forward pre-filled (DD-R9-4) before
            # anyone is notified, so the task is never presented with an empty
            # mandatory Red slot.
            resources.carry_forward_red(task, tdef)
        _apply_on_open(task, tdef)
        if tdef.get("is_allocation_task"):
            # R12: an ``auto_close_when_staffed`` task (18) that opens already
            # staffed closes itself — and is not announced as work waiting.
            if resources.auto_close_if_staffed(task, tdef) is None:
                resources.notify_allocation_task_open(task)
    return task


def open_pending_task(task):
    """Flip a ``pending`` trigger task to ``open`` (scheduler action).

    Idempotent — a no-op unless the task is still pending. Opens (and links) the
    task's stage at genuine open time, resolves the assignee, and reconciles the
    lead's stages so the newly-opened stage closes any prior main-path stage.
    """
    if task.status != Task.Status.PENDING:
        return task
    wf = active_workflow(task.lead.lead_type)
    tdef = _task_defs(wf.workflow).get(task.task_no, {}) if wf else {}
    task.status = Task.Status.OPEN
    task.task_start_dt = timezone.now()
    task.stage = _attach_stage(task.lead, tdef)
    task.project_id = task.stage.project_id if task.stage is not None else ""
    task.assigned_to = _resolve_assignee(task.lead, tdef)
    task.save(update_fields=["status", "task_start_dt", "stage", "project_id", "assigned_to", "updated_at"])
    if tdef.get("is_allocation_task"):
        resources.carry_forward_red(task, tdef)  # R9 (DD-R9-4)
    _apply_on_open(task, tdef)
    if wf is not None:
        _reconcile_stages(task.lead, wf)
    if tdef.get("is_allocation_task"):
        # R12: staffed in advance (the whole point of the pending window) → the
        # trigger firing closes the task rather than queueing it.
        if resources.auto_close_if_staffed(task, tdef) is None:
            resources.notify_allocation_task_open(task)
    return task


def _configs_for(workflow, task_no):
    """All active trigger configs gating ``task_no`` (may be >1 — Task 21's
    two-rule variant, §4.12)."""
    if workflow is None:
        return []
    return list(
        WorkflowTriggerConfig.objects.filter(
            workflow=workflow, task_no=task_no, is_active=True
        )
    )


def _reference_answer(lead, reference_task_no, field_key):
    """Raw stored value of ``field_key`` on the most-recent **closed** instance of
    ``reference_task_no``, or None — the shared lookup behind both a trigger's
    numeric condition and an ``assignee_rules`` answer match (R9)."""
    ref = (
        lead.tasks.filter(task_no=reference_task_no, status=Task.Status.CLOSED)
        .order_by("-task_end_dt", "-id")
        .first()
    )
    if ref is None:
        return None
    return (ref.extra_fields or {}).get(field_key)


def _reference_value(lead, reference_task_no, field_key):
    """Numeric value of ``field_key`` on the most-recent closed reference task,
    or None — used to evaluate a trigger's condition (Task 21 duration rule)."""
    try:
        return float(_reference_answer(lead, reference_task_no, field_key))
    except (TypeError, ValueError):
        return None


def _config_condition_holds(lead, config):
    """True when ``config`` has no condition, or its condition currently holds —
    the reference task's ``condition_field_key`` value is ≤ ``condition_max``."""
    if not config.condition_field_key or config.condition_max is None:
        return True
    val = _reference_value(lead, config.reference_task_no, config.condition_field_key)
    return val is not None and val <= float(config.condition_max)


def _applicable_config(lead, configs):
    """Pick the trigger config that applies for ``lead`` from a task's configs.

    A conditional rule (e.g. "duration < 6 months → shorter offset") wins when
    its condition holds; otherwise the unconditional default rule applies. None
    if no rule is eligible.
    """
    default = None
    conditional = None
    for c in configs:
        if c.condition_field_key and c.condition_max is not None:
            if _config_condition_holds(lead, c):
                conditional = c
        else:
            default = c
    return conditional or default


def _active_trigger_config(workflow, task_no, lead):
    """The applicable trigger config gating ``task_no`` for ``lead``, or None."""
    return _applicable_config(lead, _configs_for(workflow, task_no))


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
def reassign_owner_tasks(lead, old_owner, new_owner, actor):
    """Move the outgoing lead owner's live tasks to the incoming owner (R9-4).

    Reassigning a lead used to change only ``lead.assigned_to`` — the tasks
    already in flight stayed with the previous owner, so the new owner's name
    showed on the lead while the old owner kept the edit rights, and work only
    genuinely handed over at the *next* task. Per the user: "the current working
    task [is] also reassigned to the person regardless [of whether the] task
    [is] completed or not completed."

    Moves every task still in play (``open``/``hold``/``pending``) assigned to
    ``old_owner``, **except** a task the workflow assigns to the Execution Red
    while ``old_owner`` is still this lead's Red (DD-R9-7) — those are theirs as
    Red, and change hands through the Resources slot-reassign instead. Closed and
    skipped tasks keep their historical assignee. Returns the moved tasks.
    """
    if old_owner is None or new_owner is None or old_owner.id == new_owner.id:
        return []
    defs = task_defs_for(lead.lead_type)
    current_red = resources.latest_execution_red(lead)
    red_is_outgoing_owner = current_red is not None and current_red.id == old_owner.id
    moved = [
        task
        for task in lead.tasks.filter(
            assigned_to=old_owner,
            status__in=[Task.Status.OPEN, Task.Status.HOLD, Task.Status.PENDING],
        )
        if not (
            red_is_outgoing_owner
            and defs.get(task.task_no, {}).get("assignee") == "execution_red"
        )
    ]
    if not moved:
        return []
    lead.tasks.filter(pk__in=[t.pk for t in moved]).update(assigned_to=new_owner)
    lead_label = f"{lead.company_name} — {lead.project_name}"
    events.log_activity(
        lead,
        actor,
        "task",
        f"{len(moved)} task(s) reassigned from {old_owner.name} to {new_owner.name} "
        f"with the lead",
    )
    if old_owner.id != actor.id:
        events.notify(
            old_owner,
            Notification.Type.TASK_REASSIGNED,
            f"“{lead_label}” was reassigned to {new_owner.name} — "
            f"{len(moved)} task(s) you held moved to them.",
            events.lead_link(lead),
        )
    if new_owner.id != actor.id:
        events.notify(
            new_owner,
            Notification.Type.TASK_REASSIGNED,
            f"{len(moved)} task(s) on “{lead_label}” were reassigned to you.",
            events.lead_link(lead),
        )
    return moved


def _enter_flow(lead, wf):
    """Pre-mark the lead's flow skips and open its entry task(s); returns them.

    The entry point of a *flow*, not of a lead's whole life: called at workflow
    start and again when Task 0's answer resolves a spawned Mining lead's flow
    (R19), which is why it is separate from :func:`start_workflow`'s guards.
    """
    defs = _task_defs(wf.workflow)
    flow = _flow_for(lead, wf)
    _materialize_skips(lead, defs, flow.get("skip", []))
    opened = []
    for no in flow.get("entry", [1]):
        tdef = defs.get(no)
        if tdef is not None:
            opened.append(open_task(lead, tdef))
    _reconcile_stages(lead, wf)
    return opened


@transaction.atomic
def start_workflow(lead):
    """Start a newly-owned lead's workflow at its flow/type entry point (§4.3.1).

    Idempotent and guarded: only for an active lead that has an owner and no
    tasks yet. The entry task(s) and any stages the flow skips are data on the
    workflow's ``flows`` map (DD1/DD2): BD/Mining leads enter per ``flow_of_tasks``
    (Task 1, or Task 16 for Direct Proposal), Extension leads at Task 22, and a
    Mining lead spawned off Task 21 — which has no flow yet — at the pre-flow
    selection task (Task 0, R19). The flow's ``skip`` list is pre-marked
    ``skipped`` for tracker accuracy. Returns the first opened Task, or ``None``
    if nothing was started.
    """
    if not lead.assigned_to_id or lead.status != Lead.Status.IN_PROGRESS:
        return None
    if lead.tasks.exists():
        return None
    wf = active_workflow(lead.lead_type)
    if wf is None:
        return None
    opened = _enter_flow(lead, wf)
    return opened[0] if opened else None


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
    elif ftype == "choice":
        # R18: a fixed option list in the workflow data (e.g. Task 21's flow for
        # the Mining lead it spawns). An empty/absent ``options`` list accepts
        # anything rather than rejecting everything — a mis-seeded workflow
        # shouldn't make its task uncloseable.
        allowed = [o.get("value") for o in field.get("options", [])]
        if allowed and value not in allowed:
            return "Select one of the listed options."
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


def _reconcile_stages(lead, wf):
    """Close any main-path stage the workflow has advanced past (R3, §4.4).

    A stage in the workflow's ``stage_sequence`` closes once (a) a **later**
    main-path stage has opened (so no new tasks of this stage will open) **and**
    (b) it has no ``open``/``pending``/``hold`` tasks left. Condition (b) keeps
    2HR open while its parallel money branch (Tasks 6/7) is still running — the
    2HR resources release only when that stage closes (§4.7). Parallel stages
    (Mining ``M``, Extension ``E{n}``) are **not** in the sequence and are left
    open here; their close is R6. Idempotent — safe to call after every open/close.
    """
    sequence = (wf.workflow or {}).get("stage_sequence", [])
    if not sequence:
        return
    reached = set(lead.stages.values_list("stage", flat=True))
    max_reached_idx = max(
        (sequence.index(code) for code in reached if code in sequence),
        default=-1,
    )
    for stage in lead.stages.filter(status=LeadStage.Status.IN_PROGRESS):
        if stage.stage not in sequence:
            continue  # parallel M / E{n} — closed in R6
        if sequence.index(stage.stage) >= max_reached_idx:
            continue  # nothing later has opened yet
        if stage.tasks.filter(
            status__in=[Task.Status.OPEN, Task.Status.PENDING, Task.Status.HOLD]
        ).exists():
            continue  # still has live tasks (e.g. the 2HR 6/7 money branch)
        stage.status = LeadStage.Status.CLOSED
        stage.stage_end_dt = timezone.now()
        stage.save(update_fields=["status", "stage_end_dt", "updated_at"])
        # D11: 2HR/SnT release their resource allocations the moment their own
        # stage closes (Implementation/Extension release on Task 27 *opening*
        # instead, via _apply_on_open — those stages aren't auto-closed until R6).
        if stage.stage in resources.STAGE_CLOSE_RELEASE_STAGES:
            resources.release_stage_allocations(lead, stage)


def _announce_mining_window(task):
    """The mining-opportunity task (21) has opened — the lead is in its Mining
    stage and someone has to go look for new work (§5.3.1).

    Louder than the generic task-open notification the API sends: the assignee
    **and** the lead's owner/creator hear about it, because this task opens off a
    trigger months after go-live (§4.12) rather than off somebody's click.
    Flags the in-memory task ``open_announced`` so the caller doesn't also send
    the generic note to the assignee.
    """
    lead = task.lead
    message = (
        f"Mining window open on “{lead.company_name} — {lead.project_name}”: "
        f"Task {task.task_no} “{task.task_name}” is ready — check the client for a "
        f"new project opportunity."
    )
    link = events.lead_link(lead)
    events.notify(task.assigned_to, Notification.Type.TASK_OPENED, message, link)
    events.notify_lead_managers(
        lead,
        Notification.Type.TASK_OPENED,
        message,
        link=link,
        exclude=[task.assigned_to_id],
    )
    task.open_announced = True


def _apply_on_open(task, tdef):
    """Run the task's ``on_open`` side effects (R5, Tech Req §4.7).

    Generic — the concrete task numbers (21, 27) live only in the workflow JSON.
    The hooks are releasing the lead's Implementation/Extension-loop resource
    allocations (``on_open.release_allocations``, D11) and announcing the mining
    window (``is_mining_opportunity`` — a task-level marker, since the frontend
    reads the same flag). Runs on both open paths: :func:`open_task` for an
    immediate open and :func:`open_pending_task` when a trigger fires.
    """
    oc = tdef.get("on_open") or {}
    if oc.get("release_allocations"):
        resources.release_open_engagement_allocations(task.lead)
    if tdef.get("is_mining_opportunity"):
        _announce_mining_window(task)


def _record_project_cycle(task, user):
    """Snapshot a ``project_details`` commercial row for the cycle ``task`` just
    closed (R6, TR §4.8) — Task 20 (stage ``IM``) or Task 26 (stage ``E{n}``).
    Reads the closing task's own ``fixed_fee``/``variable_fee_cap_total`` fields
    (both defined on Task 20/26's shared field schema, §5)."""
    values = task.extra_fields or {}
    projects.record_project_cycle(
        task.lead,
        task.stage,
        user,
        fixed_fee=values.get("fixed_fee"),
        variable_fee=values.get("variable_fee_cap_total"),
    )


def _apply_on_close(task, tdef, user):
    """Run the task's ``on_close`` side effects (Tech Req §4.8; R6).

    Generic — the concrete task numbers live only in the workflow JSON as data
    flags: ``project_details`` (Task 20/26 — snapshot the cycle's commercials)
    and ``close_extension_stage`` (Task 26 only — close its own ``E{n}`` stage
    so the loop-back to Task 22 opens the *next* one via
    :func:`projects.ensure_extension_stage`; Task 20's ``IM`` stage instead
    closes through the ordinary main-sequence :func:`_reconcile_stages`).

    R5 note: allocation release is **not** one of these hooks — release timing
    is a stage-close/task-open event (D11), handled by
    :func:`_reconcile_stages`/:func:`_apply_on_open` instead.
    """
    oc = tdef.get("on_close") or {}
    if not oc:
        return
    if oc.get("project_details"):
        _record_project_cycle(task, user)
    if oc.get("close_extension_stage"):
        projects.close_stage(task.stage)


# --- Mining spawn (R6, PRD §5.3.1, §13; TR row 21) --------------------------


def _choice_label(field, value):
    """The display label for a ``choice`` field's stored value (R19)."""
    for option in (field or {}).get("options", []):
        if option.get("value") == value:
            return option.get("label", value)
    return value


def _spawn_mining_lead(task, user):
    """Task 21 "go-ahead = Yes": spawn + start the Mining child lead, notify
    its owner and the parent's managers, and log the event on both lead rows.

    Called from the matched routing rule's ``spawn_lead`` flag (not an
    ``on_close`` hook — it is conditional on the answer, which routing already
    evaluates) — see :func:`complete_task`.

    The child is spawned with **no** ``flow_of_tasks`` (R19), so it starts on the
    pre-flow selection task (Task 0) rather than on a path copied from the
    parent: the mining project only begins months from now, and nobody can name
    its flow at go-ahead time. Which task that is comes from
    :func:`start_workflow`, not from an assumption here.
    """
    parent = task.lead
    child = projects.spawn_mining_lead(parent, user)
    # ``start_workflow`` usually returns None here: setting the child's owner
    # inside ``spawn_mining_lead`` already fired the workflow-start signal
    # (leads/signals.py), and it is idempotent. So fall back to reading the
    # entry task off the child — excluding any ``skipped`` rows the flow
    # pre-materialized, which are created *before* the entry task and would
    # otherwise sort first.
    first_task = start_workflow(child) or (
        child.tasks.exclude(status=Task.Status.SKIPPED).order_by("id").first()
    )
    # Transient, for the API layer's ``spawned_lead`` payload.
    child.entry_task = first_task
    child_project_id = projects.derived_project_id(child)
    events.log_activity(
        parent,
        user,
        "lead",
        f"Mining opportunity approved — spawned a new Mining lead (#{child.id}, "
        f"{child_project_id}); its flow of tasks is still to be selected",
    )
    events.log_activity(
        child,
        user,
        "lead",
        f"Spawned from parent lead #{parent.id} (Task 21 go-ahead) — "
        f"awaiting flow-of-tasks selection",
    )
    opened_at = (
        f"Task {first_task.task_no} ({first_task.task_name})"
        if first_task is not None
        else "its first task"
    )
    message = (
        f"“{parent.company_name} — {parent.project_name}” has gone into Mining — "
        f"a new Mining lead ({child_project_id}) is open at {opened_at}."
    )
    link = events.lead_link(child)
    if child.assigned_to_id:
        events.notify(child.assigned_to, Notification.Type.LEAD_ASSIGNED, message, link)
    # The parent's owner/creator hear about it too — the mining lead is a new
    # engagement off their lead. The actor is skipped (they get the in-session
    # alert from the Save & Complete response) and so is the child's owner,
    # already notified above.
    events.notify_lead_managers(
        parent,
        Notification.Type.LEAD_ASSIGNED,
        message,
        actor=user,
        link=link,
        exclude=[child.assigned_to_id],
    )
    return child


# --- Flow-of-tasks selection (R19, Task 0) ----------------------------------


def _apply_flow_selection(task, tdef, wf, user):
    """Close-time effect of the pre-flow selection task (``selects_flow_of_tasks``).

    Writes the chosen flow onto the lead, then **enters** it — the successors are
    the newly-resolved flow's ``entry`` list plus its pre-marked ``skip`` rows,
    which no routing rule could name (the answer is given in the same breath).
    Returns the opened tasks so :func:`complete_task` can hand them back like any
    other successor set.
    """
    lead = task.lead
    key = (tdef.get("selects_flow_of_tasks") or {}).get("field_key", "flow_of_tasks")
    chosen = (task.extra_fields or {}).get(key)
    # ``assert_closable`` already enforced "required" + the ``choice`` option
    # list; this guards the remaining case — a workflow seeded with an option
    # that is not a real Lead.FlowOfTasks value, which would otherwise leave the
    # lead blank and re-enter the selection flow forever.
    if chosen not in {code for code, _ in Lead.FlowOfTasks.choices}:
        raise serializers.ValidationError(
            {key: "Select a valid flow of tasks before completing this task."}
        )
    field = next((f for f in tdef.get("extra_fields", []) if f.get("key") == key), None)
    lead.flow_of_tasks = chosen
    lead.save(update_fields=["flow_of_tasks", "updated_at"])
    events.log_activity(
        lead,
        user,
        "lead",
        f"Flow of tasks selected: “{_choice_label(field, chosen)}” — the workflow "
        f"starts on this path",
    )
    return _enter_flow(lead, wf)


# --- Finance gates + task re-open + auto-drop (R4, PRD §5.5/§5.10) ----------

def _notify_finance_gate_open(task):
    """Alert every Finance user that a payment-approval gate is waiting.

    Gate tasks (7/15/28) open **unassigned** — they are worked from the Accounts
    queue — so the normal "notify the new assignee" path never fires for them.
    Best-effort/additive, mirroring :func:`resources._notify_resource_managers`.
    """
    events.notify_finance(
        task.lead,
        Notification.Type.TASK_OPENED,
        f"Payment approval needed: Task {task.task_no} “{task.task_name}” on "
        f"“{task.lead.company_name} — {task.lead.project_name}”.",
    )


def _reopen_task(task, *, actor=None, reason="", clear_fields=False):
    """Return a ``closed`` task to ``open`` — the one sanctioned exception to
    "closed is final" (§5.10).

    Clears ``task_end_dt``, increments ``reopened_count``, and (for a re-opened
    Finance gate) wipes the stale answer so it is re-worked from scratch. The
    original ``task_start_dt`` is kept so the task keeps its start time.
    Idempotent only in the sense that the caller must supply a genuinely-closed task.
    """
    task.status = Task.Status.OPEN
    task.task_end_dt = None
    task.reopened_count = (task.reopened_count or 0) + 1
    if clear_fields:
        task.extra_fields = {}
    task.save(
        update_fields=["status", "task_end_dt", "reopened_count", "extra_fields", "updated_at"]
    )
    return task


def _bounce_finance_gate(gate, tdef, actor):
    """Handle a Finance gate answered "No" (§5.10): re-open the preceding money
    task so its owner chases the outstanding payment.

    The gate itself has already been closed (with its mandatory remark) by the
    caller; this re-opens the most-recent closed instance of ``reopen_on_no``,
    logs the bounce + remark on the activity feed, and notifies the task's
    assignee. Returns the re-opened task, or None if the preceding task can't be
    found (should not happen — the gate only opens after it closes).
    """
    lead = gate.lead
    prev_no = tdef.get("reopen_on_no")
    prev = (
        lead.tasks.filter(task_no=prev_no, status=Task.Status.CLOSED)
        .order_by("-task_end_dt", "-id")
        .first()
    )
    if prev is None:
        return None
    reason = ((gate.extra_fields or {}).get("remark") or "").strip()
    _reopen_task(prev, actor=actor, reason=reason)
    events.log_activity(
        lead,
        actor,
        "task",
        f"Task {prev.task_no} “{prev.task_name}” re-opened — payment not yet received "
        f"(Finance gate Task {gate.task_no})",
        reason,
    )
    if prev.assigned_to_id and prev.assigned_to_id != getattr(actor, "id", None):
        events.notify(
            prev.assigned_to,
            Notification.Type.TASK_OPENED,
            f"Task {prev.task_no} “{prev.task_name}” was re-opened — payment is still "
            f"outstanding. {reason}".strip(),
            events.lead_link(lead),
        )
    return prev


def _complete_lead(gate, tdef, actor):
    """Completion gate (§5.10): flip the lead to ``Completed`` once **both** the
    closure task (Task 27) and its Accounts-approval gate (Task 28) are closed.

    Only invoked for a gate carrying ``completes_lead`` answered "Yes"; guards on
    the preceding task actually being closed so a stray call can't complete a
    lead early. Still-pending trigger tasks can never open afterwards, so they
    are swept to ``skipped`` to keep the path taken explicit.
    """
    lead = gate.lead
    prev_no = tdef.get("reopen_on_no")
    if not lead.tasks.filter(task_no=prev_no, status=Task.Status.CLOSED).exists():
        return False
    lead.status = Lead.Status.COMPLETE
    lead.save(update_fields=["status", "updated_at"])
    lead.tasks.filter(status=Task.Status.PENDING).update(status=Task.Status.SKIPPED)
    events.log_activity(
        lead,
        actor,
        "status",
        "Lead marked Completed — Project Closure and Accounts Approval both closed",
    )
    return True


@transaction.atomic
def complete_task(task, user):
    """Validate, close ``task``, apply its ``on_close`` effects, and create its
    successor(s). Returns the opened tasks; a Mining lead spawned off Task 21 is
    additionally exposed as ``task.spawned_mining_lead`` (see below).

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
    task.task_end_dt = timezone.now()
    task.elapsed_time = holds.compute_elapsed_time(task, closed_at=task.task_end_dt)
    task.save(update_fields=["status", "task_end_dt", "elapsed_time", "updated_at"])

    # Side effects (Project ID, allocation close, lead status) before routing so
    # the successor's assignee resolution / trigger checks see the new state.
    _apply_on_close(task, tdef, user)

    # R24-2: if this task *is* the manpower request for a later allocation step,
    # correct the `man_power_required` snapshot on anybody already staffed there
    # in advance — their rows were written when the answer was still unknown.
    resources.sync_manpower_requirement(task.lead, task.task_no, defs)

    values = task.extra_fields or {}

    # Finance gate bounce (§5.10): a "No" answer closes the gate (done above,
    # with its mandatory remark) and re-opens the preceding money task instead
    # of routing forward — the sanctioned closed→open exception. No successors.
    if tdef.get("is_finance_gate") and values.get("payment_received") == "No":
        _bounce_finance_gate(task, tdef, user)
        _reconcile_stages(task.lead, wf)
        return []

    # Flow-of-tasks selection (R19, Task 0): the answer *is* the routing — it
    # sets the lead's flow and opens that flow's entry task(s). An early return
    # like the gate bounce above, since the successors come from the flow map
    # rather than from this task's (empty) routing rules.
    if tdef.get("selects_flow_of_tasks"):
        return _apply_flow_selection(task, tdef, wf, user)

    rule = _matched_route(tdef, values)

    # Auto-drop (§5.5): a matched routing rule may carry a ``lead_status`` side
    # effect (Task 8 "Go-ahead = No" → Dropped). Unlike a manual drop this does
    # NOT cascade to the lead's other open tasks — the parallel Tasks 6 & 7 stay
    # open so the 2HR reimbursement + its approval can still complete. The rule's
    # ``open`` list is empty on such a branch, so no new tasks open.
    rule_status = rule.get("lead_status")
    if rule_status == Lead.Status.DROPPED and task.lead.status == Lead.Status.IN_PROGRESS:
        task.lead.status = Lead.Status.DROPPED
        task.lead.save(update_fields=["status", "updated_at"])
        events.log_activity(
            task.lead,
            user,
            "status",
            f"Lead automatically dropped — no client go-ahead (Task {task.task_no})",
        )

    # Mining spawn (R6, §5.3.1/§13): Task 21 "go-ahead = Yes" carries
    # ``spawn_lead`` on its matched rule — conditional on the answer, so it
    # lives on the rule rather than an unconditional ``on_close`` hook.
    if rule.get("spawn_lead"):
        # Stashed on the in-memory task (a transient attribute, not a field) so
        # the API layer can tell the person who just answered "Yes" that the
        # lead has gone into Mining, in the same response — their own bell
        # notification would otherwise only surface on the next poll.
        task.spawned_mining_lead = _spawn_mining_lead(task, user)

    # flow_of_tasks entry edges + skip-filtering (D6). An ``edges`` entry for this
    # task overrides its default ``open`` list (e.g. SnT flow routes Task 2 → 9,
    # bypassing the skipped 2HR body); the flow's ``skip`` set (pre-marked at start)
    # also filters any successor a branch would otherwise open.
    flow = _flow_for(task.lead, wf)
    flow_skip = set(flow.get("skip", []))
    edges = flow.get("edges", {})
    if str(task.task_no) in edges:
        open_list = list(edges[str(task.task_no)])
        skip_list = []
    else:
        open_list = list(rule.get("open", []))
        skip_list = list(rule.get("skip", []))
    open_list = [no for no in open_list if no not in flow_skip]

    # Steps the chosen branch routes around become explicit `skipped` rows
    # (§4.4 v14) — the rule's `skip` list is data in the workflow JSON.
    _materialize_skips(task.lead, defs, skip_list)

    opened = []
    for target_no in open_list:
        target_def = defs.get(target_no)
        if target_def is None:
            continue
        # A downstream Finance gate that already has a closed instance (this is a
        # re-close after a bounce) is **re-opened** rather than duplicated (§5.10)
        # — one gate row flips open↔closed across the whole bounce loop, so the
        # tracker never double-counts it. Its stale answer is cleared for a fresh
        # decision, and Finance is re-notified.
        if target_def.get("is_finance_gate"):
            existing = (
                task.lead.tasks.filter(task_no=target_no, status=Task.Status.CLOSED)
                .order_by("-task_end_dt", "-id")
                .first()
            )
            if existing is not None:
                _reopen_task(existing, actor=user, clear_fields=True)
                _notify_finance_gate_open(existing)
                opened.append(existing)
                continue
        # A trigger-gated successor whose offset date has already arrived (the
        # reference date sits inside the offset window — e.g. an engagement end
        # date under 2 months out for Task 22) opens right now rather than
        # waiting for the scheduler; only a genuinely future open date pends.
        config = _active_trigger_config(wf, target_no, task.lead)
        pending = config is not None and not _trigger_already_due(task.lead, config)
        status = Task.Status.PENDING if pending else Task.Status.OPEN
        new_task = open_task(task.lead, target_def, status=status)
        if new_task.is_finance_gate and status == Task.Status.OPEN:
            _notify_finance_gate_open(new_task)
        opened.append(new_task)

    # Completion gate (§5.10): Task 28 "Yes" with Task 27 closed completes the lead.
    if tdef.get("completes_lead") and values.get("payment_received") == "Yes":
        _complete_lead(task, tdef, user)

    # Close any main-path stage the flow has now advanced past (§4.4).
    _reconcile_stages(task.lead, wf)
    return opened


def _closure_task_def(defs):
    """The workflow's Project-Closure task (Task 27) — found by its
    ``is_project_closure`` flag, not a hardcoded task number (R6)."""
    for tdef in defs.values():
        if tdef.get("is_project_closure"):
            return tdef
    return None


def can_short_close(lead):
    """Whether short-close (§9.2/§5.12) is currently available for ``lead``.

    Data-driven — no task numbers hardcoded. The workflow JSON marks its
    Project-Closure task with ``is_project_closure`` and whichever task(s)
    grant short-close access with ``grants_short_close`` (Task 20 Implementation
    and Task 26 Extension Implementation — TR row 26 / §9.2: "on open, give
    Shailesh short-close access", widened to Task 20 by the user on 2026-07-30 so
    the hatch covers the whole live engagement). *Design decision (R6,
    documented — no natural closure trigger exists mid-Extension-loop, TR row
    27's list of Task-27 openers, and Task 20's engagement-end-date trigger only
    fires on the planned end date):* once granted, access persists for the lead's
    life (the docs describe no revocation) until closure has actually been
    reached — i.e. any instance of the closure task already exists, regardless of
    its current status (even a Finance-bounced one back to ``open``).

    A ``pending`` grant task doesn't count: it is a seeded row waiting on its
    date trigger, and the docs grant access "on open".
    """
    if lead.status != Lead.Status.IN_PROGRESS:
        return False
    defs = task_defs_for(lead.lead_type)
    closure = _closure_task_def(defs)
    if closure is None:
        return False
    if lead.tasks.filter(task_no=closure["task_no"]).exists():
        return False
    grant_nos = [no for no, tdef in defs.items() if tdef.get("grants_short_close")]
    if not grant_nos:
        return False
    return (
        lead.tasks.filter(task_no__in=grant_nos)
        .exclude(status=Task.Status.PENDING)
        .exists()
    )


@transaction.atomic
def open_project_closure(lead, user, *, remark):
    """Short-close a project (§9.2/§5.12): open the Project-Closure task ahead
    of its natural trigger.

    A **lead-scoped** action (R6) — unlike the pre-R6 model, which acted on one
    "current" ``project_details`` row, short-close now fires while the current
    Extension-Implementation cycle is still *open* (that row doesn't exist yet;
    it's only inserted when the cycle's own closing task completes normally,
    §4.8) — see :func:`can_short_close` for the eligibility check this assumes
    the caller has already made.

    In one transaction: sweeps every ``open``/``hold``/``pending`` task under
    the lead to ``skipped`` (flagged ``short_closed`` — short-closing moves
    straight to closure regardless of which step it was on); closes whichever
    engagement stage (Implementation or the open Extension loop) was cut short
    — its commercials were never finalized (Task 20/26 never closed), so no
    ``project_details`` row is created for it, unlike a normal cycle close;
    leaves Mining (``M``) untouched, since it runs independently; opens the
    Project-Closure task (which releases the engagement's allocated resources
    via its own ``on_open`` hook, §4.7); and stamps the compulsory remark on
    the lead. Returns the opened task, or ``None`` if short-close isn't
    currently available.
    """
    if not can_short_close(lead):
        return None
    defs = task_defs_for(lead.lead_type)
    closure = _closure_task_def(defs)
    lead.tasks.filter(
        status__in=[Task.Status.OPEN, Task.Status.HOLD, Task.Status.PENDING]
    ).update(status=Task.Status.SKIPPED, short_closed=True)
    for stage in lead.stages.filter(status=LeadStage.Status.IN_PROGRESS):
        if stage.stage == LeadStage.IM or _EXTENSION_STAGE_RE.match(stage.stage):
            projects.close_stage(stage)
    task = open_task(lead, closure)
    lead.short_close_remark = remark
    lead.short_closed_at = timezone.now()
    lead.short_closed_by = user
    lead.save(
        update_fields=["short_close_remark", "short_closed_at", "short_closed_by", "updated_at"]
    )
    wf = active_workflow(lead.lead_type)
    if wf is not None:
        _reconcile_stages(lead, wf)
    return task


# --- Trigger scheduler (Tech Req §4.12 / PRD §5.6) -------------------------

def _reference_date(lead, reference_task_no, field_key):
    """The reference date for a trigger: ``field_key`` on the most recent
    *closed* instance of ``reference_task_no`` under ``lead``. None if absent.
    """
    ref_task = (
        lead.tasks.filter(task_no=reference_task_no, status=Task.Status.CLOSED)
        .order_by("-task_end_dt", "-id")
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
    config = _active_trigger_config(wf, task.task_no, task.lead)
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

    Only ``In Progress`` leads are eligible. Iterates pending tasks (not configs)
    so Task 21's two-rule variant resolves to the single applicable config per
    lead (§4.12), and so the unified graph applies to Mining/Extension leads too
    (DD1) rather than being filtered by ``workflow.type``.
    """
    today = today or timezone.now().date()
    opened = []
    pending = (
        Task.objects.filter(
            status=Task.Status.PENDING,
            lead__status=Lead.Status.IN_PROGRESS,
        )
        .select_related("lead")
        .order_by("id")
    )
    for task in pending:
        wf = active_workflow(task.lead.lead_type)
        config = _active_trigger_config(wf, task.task_no, task.lead) if wf else None
        if config is not None and _trigger_already_due(task.lead, config, today=today):
            open_pending_task(task)
            opened.append(task)
    return opened
