"""Authoritative BD workflow definition (Tech Req §5 / PRD §5.3).

This is the *source* of the ``workflows.workflow`` JSON that the engine walks.
It is intentionally plain data (no logic) so it can be seeded into the DB and
thereafter edited from Django admin without a code change (Tech Req §4.11).
``leads/engine.py`` is the only interpreter of this shape.

Schema
------
Each task is a dict:

- ``task_no`` int, ``name`` str.
- ``assignee``: how the engine resolves ``Task.assigned_to`` when it opens the
  step — ``default_bd_person`` (the lead's ``assigned_to``), ``resource_manager``
  or ``execution_brown``. The latter two are resolved by the Resource-Manager
  allocation flow in **Phase 6**; until then the engine opens those steps
  unassigned (Tech Req §6 gives the lead owner view-only access).
  ``execution_brown`` resolves to the current allocation's Execution Brown (or
  its first White if Brown is empty) — the allocated resource who *edits* the
  step. The Execution Red is a view-only overseer across all steps and is not an
  assignee (Phase 13 override of PRD §5.7, confirmed with the user 2026-07-15).
- ``is_allocation_task`` / ``allocation_type``: tasks 2/6/11/15 carry no
  checklist or fields — they show status only until the Resource Manager
  submits the allocation form (Phase 6). ``allocation_type`` drives which
  ``resource_allocation`` row is created when the task opens.
- ``manpower_source`` (allocation tasks only): ``{"task_no", "fields"}`` — the
  upstream task and numeric field(s) whose sum seeds the new allocation row's
  ``man_power_required`` (the over-allocation reference, §4.7). Phase 6.
- ``on_close``: Phase-6 side effects applied by the engine after this task
  closes, keyed generically so no task number is hardcoded:
  ``close_allocations`` (list of allocation types to auto-close — resources
  freed), ``lead_status`` (system-only status to set on the lead),
  ``project_id`` (``"generate"`` at Task 12 / ``"regenerate"`` at Task 16), and
  ``project_details`` (``{"allocation_type"}`` to open/cycle a history row, or
  the string ``"complete"`` to mark the current cycle Complete). See
  ``leads/projects.py`` + ``leads/resources.py`` for the implementations.
- ``trigger``: forward-looking hint for the Phase 5 scheduler — which earlier
  task/field supplies the reference date these steps open relative to. The
  Phase 4 engine ignores it and opens the successor immediately on closure.
- ``checklist``: ``[{"key", "label"}, ...]`` — instantiated as ``Checklist``
  rows; every item must be ``complete`` before the task can close.
- ``extra_fields``: dynamic per-step fields. Each: ``key``, ``label``,
  ``type`` (``text`` | ``number`` | ``date`` | ``boolean`` (Yes/No) |
  ``rowgroup``), ``required`` bool, optional ``required_when``
  (``{"field", "equals"}`` — mandatory only when another field has a value),
  and for ``rowgroup`` a ``columns`` list + ``min_rows``. Numeric/date values
  obey the global rules (§3): number ≥ 0, no past dates.
- ``routing``: ordered rules the engine evaluates on closure to decide which
  task(s) open next. Each rule: optional ``when`` (``{"field", "equals"}``
  matched against this task's submitted ``extra_fields``) and ``open`` (list of
  successor ``task_no``\\s). First matching rule wins; a rule with no ``when``
  is the default. ``"open": []`` (or no matching rule) means terminal.
"""


def _cl(*pairs):
    """`("1.1", "Label"), ...` -> checklist item dicts."""
    return [{"key": k, "label": v} for k, v in pairs]


# Reused column set for the "Name | Role" stakeholder row-groups (Tasks 1, 3).
_NAME_ROLE_COLS = [
    {"key": "name", "label": "Name", "type": "text"},
    {"key": "role", "label": "Role", "type": "text"},
]


BD_WORKFLOW = {
    "name": "BD Workflow",
    "type": "BD",
    "tasks": [
        {
            "task_no": 1,
            "name": "Introduction and First Meeting",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("1.1", "Vector's Intro Email"),
                ("1.2", "Intro presentation to decision maker"),
                ("1.3", "Area of work/objective agreed"),
                ("1.4", "Email sent to initiate study"),
                ("1.5", "First meeting completed"),
            ),
            "extra_fields": [
                {"key": "expected_start_date", "label": "Expected start date of next stage", "type": "date", "required": True},
                {"key": "manpower_brown", "label": "Manpower required — Brown", "type": "number", "required": True, "max": 1},
                {"key": "manpower_white", "label": "Manpower required — White", "type": "number", "required": True},
                {"key": "key_stakeholders", "label": "Key stakeholder contacts", "type": "rowgroup", "min_rows": 3, "required": False, "columns": _NAME_ROLE_COLS},
            ],
            "routing": [{"open": [2]}],
        },
        {
            "task_no": 2,
            "name": "2Hr Study & Presentation Team Allocation",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_type": "2HR",
            "manpower_source": {"task_no": 1, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 1, "reference_field_key": "expected_start_date"},
            "routing": [{"open": [3]}],
        },
        {
            "task_no": 3,
            "name": "2Hr Study & Presentation",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("3.1", "Study plan done"),
                ("3.2", "NDA formality completed"),
                ("3.3", "Study interactions done"),
                ("3.4", "Data received"),
                ("3.5", "2Hr presentation date confirmed"),
                ("3.6", "2Hr presentation done"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Date of 2Hr presentation", "type": "date", "required": True},
                {"key": "key_stakeholders_mapped", "label": "Key stakeholders mapped", "type": "rowgroup", "min_rows": 3, "required": False, "columns": _NAME_ROLE_COLS},
            ],
            # After 3.6 both the reimbursement (4) and the next BD stage (5)
            # open in parallel — both notes read "Opens after 3.6".
            "routing": [{"open": [4, 5]}],
        },
        {
            "task_no": 4,
            "name": "2Hr Study Reimbursement",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("4.1", "Reimbursement expenses invoiced"),
                ("4.2", "Reimbursement expenses received"),
            ),
            "extra_fields": [
                {"key": "delay_reasons", "label": "Delay reasons if any", "type": "text", "required": False},
                {"key": "expected_receipt_date", "label": "Expected date of receipt", "type": "date", "required": True},
            ],
            # Leaf of the 2Hr sub-flow. On close the 2HR allocation frees up
            # (§4.7); no further task opens on this branch.
            "on_close": {"close_allocations": ["2HR"]},
            "routing": [{"open": []}],
        },
        {
            "task_no": 5,
            "name": "Solution Blueprint Proposal",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("5.1", "Proposal submitted"),
                ("5.2", "Proposal terms agreed"),
            ),
            "extra_fields": [
                {"key": "solution_blueprint_required", "label": "Is Solution Blueprint required?", "type": "boolean", "required": True},
                {"key": "fee", "label": "Fee for engagement", "type": "number", "required_when": {"field": "solution_blueprint_required", "equals": "Yes"}},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "max": 1, "required_when": {"field": "solution_blueprint_required", "equals": "Yes"}},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required_when": {"field": "solution_blueprint_required", "equals": "Yes"}},
                {"key": "expected_start_date", "label": "Expected start date of next stage", "type": "date", "required_when": {"field": "solution_blueprint_required", "equals": "Yes"}},
                {"key": "payment_tranches", "label": "Number of tranches of payment", "type": "number", "required_when": {"field": "solution_blueprint_required", "equals": "Yes"}},
            ],
            "routing": [
                {"when": {"field": "solution_blueprint_required", "equals": "No"}, "open": [10]},
                {"open": [6]},
            ],
        },
        {
            "task_no": 6,
            "name": "Solution Blueprint Team Allocation",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_type": "SNT",
            "manpower_source": {"task_no": 5, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 5, "reference_field_key": "expected_start_date"},
            "routing": [{"open": [7]}],
        },
        {
            "task_no": 7,
            "name": "Solution Blueprint",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("7.1", "Engagement start"),
                ("7.2", "Initial invoice raised"),
                ("7.3", "Data receipt"),
                ("7.4", "Presentation dates locked"),
                ("7.5", "SnT workshop done"),
                ("7.6", "Completion invoice"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Presentation date", "type": "date", "required": True},
                {
                    "key": "invoices_raised",
                    "label": "Invoices raised",
                    "type": "rowgroup",
                    "min_rows": 3,
                    "required": False,
                    "columns": [
                        {"key": "invoice_number", "label": "Invoice Number", "type": "text"},
                        {"key": "value", "label": "Value", "type": "number"},
                        {"key": "date", "label": "Date", "type": "date"},
                    ],
                },
                {"key": "re_presentation_required", "label": "Re-presentation required?", "type": "boolean", "required": True},
            ],
            "routing": [
                {"when": {"field": "re_presentation_required", "equals": "Yes"}, "open": [8]},
                {"open": [9]},
            ],
        },
        {
            "task_no": 8,
            "name": "Solution Blueprint Repeat Presentation",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("8.1", "Presentation dates locked"),
                ("8.2", "SnT workshop done"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Presentation date", "type": "date", "required": True},
                {"key": "re_presentation_required_again", "label": "Re-presentation required again?", "type": "boolean", "required": True},
            ],
            # Loops back to itself while Yes, else proceeds to payment (9).
            "routing": [
                {"when": {"field": "re_presentation_required_again", "equals": "Yes"}, "open": [8]},
                {"open": [9]},
            ],
        },
        {
            "task_no": 9,
            "name": "Solution Blueprint Payment",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("9.1", "Fixed fee invoices received"),
                ("9.2", "Reimbursement expenses invoiced"),
                ("9.3", "Reimbursement expenses received"),
            ),
            "extra_fields": [
                {"key": "delay_reasons", "label": "Delay reasons if any", "type": "text", "required": False},
                {"key": "expected_receipt_date", "label": "Expected date of receipt", "type": "date", "required": True},
            ],
            # SNT allocation frees up on close (§4.7); flow converges on the
            # project proposal (10), same entry point as the "skip" branch.
            "on_close": {"close_allocations": ["SNT"]},
            "routing": [{"open": [10]}],
        },
        {
            "task_no": 10,
            "name": "Project Proposal Submission",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("10.1", "Proposal submission"),
                ("10.2", "Terms agreed"),
            ),
            "extra_fields": [
                {"key": "planned_start_date", "label": "Planned engagement start date", "type": "date", "required": True},
                {"key": "planned_end_date", "label": "Planned engagement end date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {
                    "key": "fixed_fee_blocks",
                    "label": "Fixed fee (per block)",
                    "type": "rowgroup",
                    "min_rows": 1,
                    "required": False,
                    "columns": [
                        {"key": "fee", "label": "Fee", "type": "number"},
                        {"key": "manpower", "label": "Manpower", "type": "number"},
                    ],
                },
                {"key": "variable_fee_cap_total", "label": "Total variable fee cap", "type": "number", "required": False},
                {"key": "variable_milestone_fee_cap", "label": "Variable milestone fee cap", "type": "number", "required": False},
                {"key": "variable_performance_fee_cap", "label": "Variable performance fee cap", "type": "number", "required": False},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "required": True, "max": 1},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required": True},
            ],
            "routing": [{"open": [11]}],
        },
        {
            "task_no": 11,
            "name": "Project Team Allocation",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_type": "Implementation",
            "manpower_source": {"task_no": 10, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 10, "reference_field_key": "planned_start_date"},
            "routing": [{"open": [12]}],
        },
        {
            "task_no": 12,
            "name": "Implementation",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("12.1", "Handover & engagement start"),
                ("12.2", "PO from customer"),
                ("12.3", "First fixed fee invoice raised"),
                ("12.4", "Agreement/contract"),
                ("12.5", "Variable parameter finalisation"),
                ("12.6", "Variable baseline sign-off"),
                ("12.7", "Addendum agreement"),
                ("12.8", "Expected variable fee over eligible period submitted"),
            ),
            "extra_fields": [
                {"key": "actual_start_date", "label": "Actual engagement start date", "type": "date", "required": True},
                {"key": "modified_planned_end_date", "label": "Modified planned engagement end date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {"key": "actual_fixed_fee_invoice_date", "label": "Actual fixed fee invoice date", "type": "date", "required": True},
                {"key": "variable_fee_start_date", "label": "Variable fee start date", "type": "date", "required": True},
            ],
            # On close (§13.1 / §4.8): lead → Hybernation, extension defaults to
            # "00", Project ID generated + a project_details row inserted linked
            # to the Implementation allocation. Routing proceeds to Extension
            # Proposal; the Implementation allocation stays Open.
            "on_close": {
                "lead_status": "Hybernation",
                "project_id": "generate",
                "project_details": {"allocation_type": "Implementation"},
            },
            "routing": [{"open": [13]}],
        },
        {
            "task_no": 13,
            "name": "Extension Proposal",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("13.1", "Discuss next set of problems with client"),
                ("13.2", "Identify area of extension"),
                ("13.3", "Solution design & preparation"),
                ("13.4", "Pitch extension proposal"),
            ),
            "extra_fields": [
                {"key": "extension_approved", "label": "Extension approved?", "type": "boolean", "required": True},
            ],
            "trigger": {"reference_task_no": 12, "reference_field_key": "modified_planned_end_date", "offset_days": 60},
            "routing": [
                {"when": {"field": "extension_approved", "equals": "No"}, "open": [17]},
                {"open": [14]},
            ],
        },
        {
            "task_no": 14,
            "name": "Extension Detail",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("13.8", "Addendum agreement"),
                ("13.9", "Expected variable fee over eligible period submitted"),
            ),
            "extra_fields": [
                {"key": "engagement_start_date", "label": "Engagement start date", "type": "date", "required": True},
                {"key": "engagement_end_date", "label": "Engagement end date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {"key": "actual_fixed_fee_invoice_date", "label": "Actual fixed fee invoice date", "type": "date", "required": True},
                {"key": "variable_fee_start_date", "label": "Variable fee start date", "type": "date", "required": True},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "required": True, "max": 1},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required": True},
            ],
            "routing": [{"open": [15]}],
        },
        {
            "task_no": 15,
            "name": "Project Extension Team Allocation",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_type": "Extension",
            "manpower_source": {"task_no": 14, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 14, "reference_field_key": "engagement_start_date"},
            "routing": [{"open": [16]}],
        },
        {
            "task_no": 16,
            "name": "Extension Implementation",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("12.1", "Handover & engagement start"),
                ("12.2", "PO from customer"),
                ("12.3", "First fixed fee invoice raised"),
                ("12.4", "Agreement/contract"),
                ("12.5", "Variable parameter finalisation"),
                ("12.6", "Variable baseline sign-off"),
                ("12.7", "Addendum agreement"),
                ("12.8", "Expected variable fee over eligible period submitted"),
            ),
            "extra_fields": [
                {"key": "engagement_start_date", "label": "Engagement start date", "type": "date", "required": True},
                {"key": "engagement_end_date", "label": "Engagement end date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {"key": "actual_fixed_fee_invoice_date", "label": "Actual fixed fee invoice date", "type": "date", "required": True},
                {"key": "variable_fee_start_date", "label": "Variable fee start date", "type": "date", "required": True},
            ],
            # On close (§13.1 / §4.8): extension counter increments, Project ID
            # regenerated off the locked base, the previous project_details row
            # → Extended and a new one inserted linked to this cycle's Extension
            # allocation. Loops back to Extension Proposal (13) — repeats until
            # Task 13 = No.
            "on_close": {
                "project_id": "regenerate",
                "project_details": {"allocation_type": "Extension"},
            },
            "routing": [{"open": [13]}],
        },
        {
            "task_no": 17,
            "name": "Project Closure",
            "assignee": "execution_brown",
            "checklist": _cl(
                ("16.1", "All fixed fee received"),
                ("16.2", "All variable fee received"),
                ("16.3", "All reimbursements received"),
            ),
            "extra_fields": [
                {"key": "final_closed", "label": "Final closed?", "type": "boolean", "required": True},
            ],
            # Terminal. On close (§4.7 / §4.8): lead → Complete, current
            # project_details → Complete, every Implementation/Extension
            # allocation auto-closes at once.
            "on_close": {
                "lead_status": "Complete",
                "project_details": "complete",
                "close_allocations": ["Implementation", "Extension"],
            },
            "routing": [{"open": []}],
        },
    ],
}
