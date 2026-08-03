"""Authoritative 28-task workflow definition (Tech Req §5 / PRD §5.3–5.6).

This is the *source* of the ``workflows.workflow`` JSON that the engine walks.
It is intentionally plain data (no logic) so it can be seeded into the DB and
thereafter edited from Django admin without a code change (Tech Req §4.11).
``leads/engine.py`` is the only interpreter of this shape.

**v4.0/v17.0 rebuild (R3).** One unified BD → Extension → Mining graph of 28
tasks. Mining/Extension leads run the *same* graph, entered at a different task
via the per-flow / per-type ``entry`` list (see ``WORKFLOW["flows"]``). No task
numbers are hardcoded in the engine — routing, skips, stages, entry edges and
trigger hints are all data here.

Top-level keys
--------------
- ``name`` / ``type`` — identity (``type = "BD"``; the graph is unified, so this
  one row serves Mining/Extension leads too — see ``engine.active_workflow``).
- ``stage_sequence`` — the main linear stage order (``BD → 2HR → SnT → IM →
  Closure``). Parallel stages (``M`` mining, ``E1`` extension) are deliberately
  **not** listed; they never auto-close a prior stage nor get auto-closed in R3.
- ``flows`` — per ``flow_of_tasks`` code (plus the ``EXTENSION`` lead-type):
  ``{entry: [task_no…], skip: [task_no…], edges: {from_no: [to_no…]}}``.
  At workflow start the engine pre-marks ``skip`` as ``skipped`` rows and opens
  ``entry``; during routing ``edges[from]`` overrides a task's default ``open``
  list, and any successor in the flow's ``skip`` set is filtered out (§4.3.4, D6).
- ``tasks`` — the 28 task dicts.

Per-task keys
-------------
- ``task_no`` int, ``name`` str, ``stage`` (a ``LeadStage`` code: ``BD``/``2HR``/
  ``SnT``/``IM``/``M``/``E1``/``Closure``) — the engine ``ensure_stage``s it and
  links ``task.stage`` when the task opens.
- ``assignee``: how the engine resolves ``Task.assigned_to`` on open —
  ``default_bd_person`` (the lead's owner), ``execution_red`` (the Red the
  Resource Manager picked on the current allocation), ``resource_manager`` /
  ``finance`` (open **unassigned** — reached via the role screen / Accounts queue).
  ``fallback_assignee`` (optional): used when the primary resolves to None
  (Task 5 falls back to Default BD when no Execution Red is allocated yet).
- ``assignee_rules`` (optional, R9): ordered overrides for ``assignee``, matched
  against an **earlier task's** stored answer — each
  ``{"when": {"task_no", "field", "equals"}, "assignee": …}``. First match wins;
  no match falls through to the plain ``assignee``. Task 3 uses it to open to the
  Default BD Person instead of the Resource Manager when Task 2 answered "no
  manpower support required" (DD-R9-3) — keeping that branch as data rather than
  a task-number check in the engine.
- ``is_allocation_task`` / ``allocation_slots`` / ``manpower_source`` (R5): the
  append-only ``resource_allocation`` slot model. ``allocation_slots`` lists
  which ``ResourceAllocation.Slot`` codes this task manages — team tasks
  (3/10/17/24) manage ``execution_red``/``execution_brown``/``white`` **plus the
  ten ``project_member_*`` slots** (R12); auditor tasks (18/25) manage
  ``auditor_1``–``auditor_4`` (R12). The ``project_member_*``/``auditor_3``/
  ``auditor_4`` extras are Resource-Manager-only and optional — see
  ``resources.visible_slots`` / ``slot_requirements``. ``manpower_source`` (team
  tasks only) points at the upstream task/field-keys the Brown/White headcount
  is read from (§7, ``resources.slot_requirements``).
- ``auto_close_when_staffed`` (R12, Task 18 only): an allocation task carrying
  this flag **completes itself the moment it opens** if its mandatory slots are
  already filled — the Resource Manager may allocate the auditors in advance
  (while the task is still trigger-``pending``), and Task 18 then never lands in
  anyone's queue. Data, not a task-number check in the engine
  (``resources.auto_close_if_staffed``). Deliberately not set on Task 25, whose
  close opens Task 26 (see PLAN.md DD-R12-3).
- ``is_finance_gate`` (7/15/28) + ``reopen_on_no`` (data pointer to the preceding
  task): a "No" answer closes the gate with a mandatory ``remark`` and re-opens
  the preceding task (R4, §5.10). ``completes_lead`` (Task 28) flips the lead to
  Completed on a "Yes" once Task 27 is closed.
- ``on_open`` (R5, Task 27 only): ``{"release_allocations": true}`` — releases
  the lead's Implementation/Extension-loop resource allocations the moment
  Task 27 opens (D11: those two release on Task-27-open, not on a stage close,
  unlike 2HR/SnT which release when their own stage closes — see the engine's
  ``_reconcile_stages``/``_apply_on_open``).
- ``on_close`` (R6): ``{"project_details": true}`` (Task 20/26) — snapshot the
  closing IM/E{n} cycle's commercials (§4.8, ``engine._record_project_cycle``);
  ``{"close_extension_stage": true}`` (Task 26 only) — close its own ``E{n}``
  stage so the loop-back to Task 22 opens the *next* one.
- ``spawn_lead`` (Task 21's matched routing rule, not ``on_close`` — it's
  conditional on the answer): spawns + starts a fresh Mining lead sharing this
  lead's ``base_code`` (§5.3.1/§13, ``engine._spawn_mining_lead``).
- ``grants_short_close`` (Tasks 20 and 26): once any instance of this task has
  opened, short-close (§9.2/§5.12) becomes available on the lead — see
  ``engine.can_short_close``. Task 20 carries it as well as 26 (user, 2026-07-30)
  so the Resource Manager's escape hatch spans the whole live engagement, not
  just the extension loop.
- ``is_project_closure`` (Task 27): lets the engine find the Project-Closure
  task generically (short-close opens it directly; ``can_short_close`` checks
  whether an instance already exists) instead of hardcoding its number.
- ``is_hanging_task`` (18): non-blocking; opening it never gates the sequence.
- ``trigger``: date-offset opening hint (``reference_task_no``,
  ``reference_field_key``, signed ``offset_days`` — positive = before, negative =
  after; optional ``condition_field_key``/``condition_max`` for Task 21's
  two-rule variant). Seeded into ``WorkflowTriggerConfig`` (§4.12, D8).
- ``checklist``: ``[{"key","label"}, …]`` — every item must be ``complete`` to close.
- ``extra_fields``: dynamic fields — ``key``, ``label``, ``type`` (``text`` |
  ``number`` | ``date`` | ``boolean`` | ``rowgroup``), ``required`` (default
  every field true per D9), optional ``required_when`` (``{field, equals}``), and
  for ``rowgroup`` a ``columns`` list + ``min_rows``. Global rules (§3) apply.
- ``routing``: ordered rules evaluated on close. Each: optional ``when`` (a single
  ``{field, equals}`` or a **list** AND-ed together), ``open`` (successor
  ``task_no``\\s), optional ``skip`` (branch-routed-around steps, materialized as
  ``skipped``). First match wins; no match / ``open: []`` = terminal on that path.

**R6** adds mining spawn, the dynamic extension loop, per-cycle project_details,
and short-close-as-an-action (see the ``on_close``/``spawn_lead``/
``grants_short_close``/``is_project_closure`` keys above) — the loop counter
itself (``E1 → E2 → …``) is **not** data here; it lives in
``projects.ensure_extension_stage``, resolved from existing ``LeadStage`` rows
rather than the workflow JSON, since a task's ``stage`` value can't express "one
more than however many loops have run so far."
"""


def _cl(*pairs):
    """`("1.1", "Label"), ...` -> checklist item dicts."""
    return [{"key": k, "label": v} for k, v in pairs]


# The two ``allocation_slots`` sets (R12). Kept as constants so the six
# allocation tasks can't drift apart; the values must match
# ``ResourceAllocation.Slot`` (not imported — this module is plain data, loaded
# before the app registry in some paths).
_TEAM_ALLOCATION_SLOTS = [
    "execution_red",
    "execution_brown",
    "white",
] + [f"project_member_{n}" for n in range(1, 11)]

_AUDITOR_ALLOCATION_SLOTS = ["auditor_1", "auditor_2", "auditor_3", "auditor_4"]


# Reused column set for the "Name | Role" stakeholder row-groups.
_NAME_ROLE_COLS = [
    {"key": "name", "label": "Name", "type": "text"},
    {"key": "role", "label": "Role", "type": "text"},
]

# Reused column set for the "Invoice No | Value | Date" invoice row-groups.
_INVOICE_COLS = [
    {"key": "invoice_number", "label": "Invoice Number", "type": "text"},
    {"key": "value", "label": "Value", "type": "number"},
    {"key": "date", "label": "Date", "type": "date"},
]

# Reused fixed-fee block columns (fee + manpower per period-month block).
_FIXED_FEE_COLS = [
    {"key": "fee", "label": "Fee", "type": "number"},
    {"key": "manpower", "label": "Manpower", "type": "number"},
]

# The 8-item implementation checklist reused by Task 20 (Implementation) and
# Task 26 (Extension Implementation) — TR §5 "26.1–26.8 (same set as Task 20)".
_IMPLEMENTATION_CHECKLIST = _cl(
    ("1", "Handover & Engagement Start"),
    ("2", "PO from Customer"),
    ("3", "First Fixed fee invoice raised"),
    ("4", "Agreement/Contract"),
    ("5", "Variable Parameter Finalisation"),
    ("6", "Variable Baseline Sign-off"),
    ("7", "Addendum Agreement"),
    ("8", "Expected variable fee over eligible period submitted"),
)


def _implementation_fields(prefix_label=""):
    """Engagement commercial fields shared by Task 20 / Task 26 (TR §5)."""
    lead = f"{prefix_label} " if prefix_label else ""
    return [
        {"key": "actual_start_date", "label": f"Actual {lead}Engagement Start Date", "type": "date", "required": True},
        {"key": "period_months", "label": "Duration (months)", "type": "number", "required": True},
        {"key": "modified_planned_end_date", "label": f"Modified Planned {lead}Engagement End Date", "type": "date", "required": True},
        {"key": "fixed_fee", "label": "Fixed Fee", "type": "number", "required": True},
        {"key": "variable_fee_cap_total", "label": "Total Variable Fee Cap", "type": "number", "required": True},
        {"key": "variable_milestone_fee_cap", "label": "Variable Milestone Fee Cap", "type": "number", "required": True},
        {"key": "variable_performance_fee_cap", "label": "Variable Performance Fee Cap", "type": "number", "required": True},
        {"key": "actual_fixed_fee_invoice_date", "label": "Actual Fixed fee invoice date", "type": "date", "required": True},
        {"key": "variable_fee_start_date", "label": "Variable Fee Start Date", "type": "date", "required": True},
    ]


BD_WORKFLOW = {
    "name": "BD Workflow",
    "type": "BD",
    "stage_sequence": ["BD", "2HR", "SnT", "IM", "Closure"],
    "flows": {
        # DEFAULT (2hr → SnT → Proposal): the full path from Task 1.
        "DEFAULT": {"entry": [1]},
        # 2HR → Proposal: structurally identical to DEFAULT; the SnT-skip is the
        # user answering Task 8 "Blueprint required = No" (§5.3.2). No pre-skip.
        "2HR_PROPOSAL": {"entry": [1]},
        # Direct Proposal: skip the whole intro/2HR/SnT body, enter at Task 16.
        "DIRECT_PROPOSAL": {
            "entry": [16],
            "skip": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        },
        # SnT → Proposal: run intro (1–2) then jump straight to SnT (Task 9),
        # skipping the 2HR body (3–8). Entry edge from Task 2 → Task 9.
        "SNT_PROPOSAL": {
            "entry": [1],
            "skip": [3, 4, 5, 6, 7, 8],
            "edges": {"2": [9]},
        },
        # Extension is a lead_type (flow_of_tasks is cleared for it); it enters
        # directly at the Extension Proposal (Task 22). §4.3.4 / D10.
        "EXTENSION": {"entry": [22]},
    },
    "tasks": [
        # ---- BD stage (1–2) ------------------------------------------------
        {
            "task_no": 1,
            "name": "Introduction and First Meeting",
            "stage": "BD",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("1.1", "Vector's Intro Email"),
                ("1.2", "Intro presentation to decision maker"),
            ),
            "extra_fields": [
                {"key": "key_stakeholders", "label": "Key stakeholder contacts", "type": "rowgroup", "min_rows": 3, "required": False, "columns": _NAME_ROLE_COLS},
                {"key": "is_2hr_agreed", "label": "Is 2HR study agreed?", "type": "boolean", "required": True},
            ],
            # The macro path is governed by flow_of_tasks (DD6): Task 1 → 2 in
            # every non-Direct flow; the "2HR agreed" answer is captured info.
            "routing": [{"open": [2]}],
        },
        {
            "task_no": 2,
            "name": "2HR Study Agreement",
            "stage": "BD",
            "assignee": "default_bd_person",
            "checklist": _cl(("2.1", "Area of work / objective agreed")),
            "extra_fields": [
                {"key": "expected_start_date", "label": "Expected start date of next stage", "type": "date", "required": True},
                {"key": "manpower_required", "label": "Is manpower support required from the resource-allocation team?", "type": "boolean", "required": True},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "max": 1, "required_when": {"field": "manpower_required", "equals": "Yes"}},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required_when": {"field": "manpower_required", "equals": "Yes"}},
            ],
            # R9-5: Task 3 (allocation) now opens on **both** answers — an
            # Execution Red is mandatory on every stage, so the allocation step
            # can never be skipped. The manpower answer decides *who works it*,
            # not whether it happens (see Task 3's ``assignee_rules``).
            "routing": [{"open": [3]}],
        },
        # ---- 2HR stage (3–8) -----------------------------------------------
        {
            "task_no": 3,
            "name": "2Hr Study & Presentation Team Allocation",
            "stage": "2HR",
            "assignee": "resource_manager",
            # R9-5 (DD-R9-3): manpower support "No" means no resource team is
            # involved — the lead's own Default BD Person picks the Execution Red
            # instead of the Resource Manager. Data, not a Python branch.
            "assignee_rules": [
                {
                    "when": {"task_no": 2, "field": "manpower_required", "equals": "No"},
                    "assignee": "default_bd_person",
                },
            ],
            "is_allocation_task": True,
            "allocation_slots": list(_TEAM_ALLOCATION_SLOTS),
            "manpower_source": {"task_no": 2, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 2, "reference_field_key": "expected_start_date"},
            "routing": [{"open": [4]}],
        },
        {
            "task_no": 4,
            "name": "2HR Study Initiation",
            "stage": "2HR",
            "assignee": "default_bd_person",
            "checklist": _cl(("4.1", "Email sent to client to initiate study")),
            "extra_fields": [],
            "routing": [{"open": [5]}],
        },
        {
            "task_no": 5,
            "name": "2Hr Study & Presentation",
            "stage": "2HR",
            "assignee": "execution_red",
            # Safety net only since R9-5 (Task 3 can no longer be skipped, so a
            # Red is always allocated by the time this opens): if no Red resolves
            # at all, the lead's Default BD Person carries the study.
            "fallback_assignee": "default_bd_person",
            "checklist": _cl(
                ("5.1", "Study Plan"),
                ("5.2", "NDA"),
                ("5.3", "Study Interactions"),
                ("5.4", "Data Received"),
                ("5.5", "2Hr Presentation date confirmed"),
                ("5.6", "2Hr Presentation done"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Date of 2Hr presentation", "type": "date", "required": True},
                {"key": "key_stakeholders_mapped", "label": "Key stakeholders mapped", "type": "rowgroup", "min_rows": 3, "required": False, "columns": _NAME_ROLE_COLS},
            ],
            # R15-1 (2026-07-29): 5.6 fans out to **6 and 8 in parallel** again —
            # the money branch (6 → its Accounts gate 7) runs alongside the client
            # go-ahead (8), exactly as TR §5 rows 6/8 specify ("Opens after 5.6"
            # on both). This reverts R9-7/DD-R9-6's sequential 5 → 6 → 7 → 8 and
            # restores PRD §5.5's auto-drop path, where a "no go-ahead" on 8 can
            # leave 6 & 7 open so the reimbursement is still chased.
            "routing": [{"open": [6, 8]}],
        },
        {
            "task_no": 6,
            "name": "2Hr Study Reimbursement",
            "stage": "2HR",
            "assignee": "execution_red",
            "fallback_assignee": "default_bd_person",
            "checklist": _cl(
                ("6.1", "Reimbursement Expenses Invoiced"),
                ("6.2", "Reimbursement Expenses Received"),
            ),
            "extra_fields": [
                {"key": "delay_reasons", "label": "Delay reasons if any", "type": "text", "required": False},
                {"key": "expected_receipt_date", "label": "Expected date of receipt", "type": "date", "required": True},
            ],
            "routing": [{"open": [7]}],
        },
        {
            "task_no": 7,
            "name": "2Hr Study Reimbursement — Accounts Approval",
            "stage": "2HR",
            "assignee": "finance",
            "is_finance_gate": True,
            "reopen_on_no": 6,
            "checklist": [],
            "extra_fields": [
                {"key": "payment_received", "label": "Payment received against all invoices?", "type": "boolean", "required": True},
                # Mandatory only on a "No" answer (§5.10): the remark recorded on
                # the bounce that re-opens Task 6 so the money is chased.
                {"key": "remark", "label": "Remark (why payment is outstanding)", "type": "text", "required_when": {"field": "payment_received", "equals": "No"}},
            ],
            # R4: Yes → close (terminal — TR §5 row 7); No → close with remark +
            # re-open Task 6 (engine, §5.10). R15-1 removes R9-7's forward edge to
            # Task 8: 8 is now opened in parallel by Task 5, so routing to it here
            # too would be a duplicate open of a task that is already in flight.
            "routing": [{"open": []}],
        },
        {
            "task_no": 8,
            "name": "Solution Blueprint Confirmation",
            "stage": "2HR",
            "assignee": "default_bd_person",
            "checklist": [],
            "extra_fields": [
                {"key": "go_ahead", "label": "Go-ahead received from client?", "type": "boolean", "required": True},
                {"key": "solution_blueprint_required", "label": "Is Solution Blueprint required?", "type": "boolean", "required_when": {"field": "go_ahead", "equals": "Yes"}},
            ],
            # Go-ahead No → auto-drop (R4: status → Dropped, no new tasks; the
            # parallel Tasks 6 & 7 stay open — §5.5). Yes + Blueprint Yes → SnT
            # (Task 9). Yes + Blueprint No → skip SnT body, open Project Proposal
            # (Task 16). ``lead_status`` on the matched rule is the data-driven
            # side effect the engine applies (no task number hardcoded).
            "routing": [
                {"when": {"field": "go_ahead", "equals": "No"}, "open": [], "lead_status": "Dropped"},
                {"when": [
                    {"field": "go_ahead", "equals": "Yes"},
                    {"field": "solution_blueprint_required", "equals": "Yes"},
                ], "open": [9]},
                {"when": [
                    {"field": "go_ahead", "equals": "Yes"},
                    {"field": "solution_blueprint_required", "equals": "No"},
                ], "open": [16], "skip": [9, 10, 11, 12, 13, 14, 15]},
            ],
        },
        # ---- SnT stage (9–16) ----------------------------------------------
        {
            "task_no": 9,
            "name": "Solution Blueprint Proposal",
            "stage": "SnT",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("9.1", "Proposal Submitted"),
                ("9.2", "Proposal terms agreed"),
            ),
            "extra_fields": [
                {"key": "fee", "label": "Fee for engagement", "type": "number", "required": True},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "max": 1, "required": True},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required": True},
                {"key": "expected_start_date", "label": "Expected start date of next stage", "type": "date", "required": True},
                {"key": "payment_tranches", "label": "Number of tranches of payment", "type": "number", "required": True},
            ],
            "routing": [{"open": [10]}],
        },
        {
            "task_no": 10,
            "name": "Solution Blueprint Team Allocation",
            "stage": "SnT",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_slots": list(_TEAM_ALLOCATION_SLOTS),
            "manpower_source": {"task_no": 9, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 9, "reference_field_key": "expected_start_date"},
            "routing": [{"open": [11]}],
        },
        {
            "task_no": 11,
            "name": "Solution Blueprint Study Initiation",
            "stage": "SnT",
            "assignee": "default_bd_person",
            "checklist": _cl(("11.1", "Email sent to initiate Solution Blueprint study")),
            "extra_fields": [],
            "routing": [{"open": [12]}],
        },
        {
            "task_no": 12,
            "name": "Solution Blueprint",
            "stage": "SnT",
            "assignee": "execution_red",
            "checklist": _cl(
                ("12.1", "Engagement Start"),
                ("12.2", "Initial Invoice raised"),
                ("12.3", "Data Receipt"),
                ("12.4", "Presentation Dates locked"),
                ("12.5", "SnT Workshop Done"),
                ("12.6", "Completion Invoice"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Presentation date", "type": "date", "required": True},
                {"key": "invoices_raised", "label": "Invoices Raised", "type": "rowgroup", "min_rows": 3, "required": False, "columns": _INVOICE_COLS},
                {"key": "re_presentation_required", "label": "Re-presentation required?", "type": "boolean", "required": True},
                {"key": "moved_to_next_stage", "label": "Has project moved to the next stage?", "type": "boolean", "required_when": {"field": "re_presentation_required", "equals": "No"}},
            ],
            # Re-presentation Yes → Task 13 (loops). No + moved Yes → Payment (14)
            # and Proposal (16) in parallel. No + moved No → Closure (27) directly.
            "routing": [
                {"when": {"field": "re_presentation_required", "equals": "Yes"}, "open": [13]},
                {"when": [
                    {"field": "re_presentation_required", "equals": "No"},
                    {"field": "moved_to_next_stage", "equals": "Yes"},
                ], "open": [14, 16], "skip": [13]},
                {"when": [
                    {"field": "re_presentation_required", "equals": "No"},
                    {"field": "moved_to_next_stage", "equals": "No"},
                ], "open": [27], "skip": [13, 14, 15, 16]},
            ],
        },
        {
            "task_no": 13,
            "name": "Solution Blueprint Repeat Presentation",
            "stage": "SnT",
            "assignee": "execution_red",
            "checklist": _cl(
                ("13.1", "Presentation Dates locked"),
                ("13.2", "SnT Workshop Done"),
            ),
            "extra_fields": [
                {"key": "presentation_date", "label": "Presentation date", "type": "date", "required": True},
                {"key": "re_presentation_required", "label": "Re-presentation required?", "type": "boolean", "required": True},
                {"key": "moved_to_next_stage", "label": "Has project moved to the next stage?", "type": "boolean", "required_when": {"field": "re_presentation_required", "equals": "No"}},
            ],
            # Same three-way fork as Task 12; loops on itself while re-presentation
            # is required.
            "routing": [
                {"when": {"field": "re_presentation_required", "equals": "Yes"}, "open": [13]},
                {"when": [
                    {"field": "re_presentation_required", "equals": "No"},
                    {"field": "moved_to_next_stage", "equals": "Yes"},
                ], "open": [14, 16]},
                {"when": [
                    {"field": "re_presentation_required", "equals": "No"},
                    {"field": "moved_to_next_stage", "equals": "No"},
                ], "open": [27], "skip": [14, 15, 16]},
            ],
        },
        {
            "task_no": 14,
            "name": "Solution Blueprint Payment",
            "stage": "SnT",
            "assignee": "execution_red",
            "checklist": _cl(
                ("14.1", "Fixed fee invoices received"),
                ("14.2", "Reimbursement Expenses Invoiced"),
                ("14.3", "Reimbursement Expenses Received"),
            ),
            "extra_fields": [
                {"key": "delay_reasons", "label": "Delay reasons if any", "type": "text", "required": False},
                {"key": "expected_receipt_date", "label": "Expected date of receipt", "type": "date", "required": True},
            ],
            "routing": [{"open": [15]}],
        },
        {
            "task_no": 15,
            "name": "Solution Blueprint Payment — Accounts Approval",
            "stage": "SnT",
            "assignee": "finance",
            "is_finance_gate": True,
            "reopen_on_no": 14,
            "checklist": [],
            "extra_fields": [
                {"key": "payment_received", "label": "Payment received against all invoices?", "type": "boolean", "required": True},
                {"key": "remark", "label": "Remark (why payment is outstanding)", "type": "text", "required_when": {"field": "payment_received", "equals": "No"}},
            ],
            # R4: Yes → close; No → close with remark + re-open Task 14 (§5.10).
            "routing": [{"open": []}],
        },
        {
            "task_no": 16,
            "name": "Project Proposal Submission",
            "stage": "SnT",
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("16.1", "Proposal Submission"),
                ("16.2", "Terms agreed"),
            ),
            "extra_fields": [
                {"key": "planned_start_date", "label": "Planned Engagement Start Date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {"key": "planned_end_date", "label": "Planned Engagement End Date", "type": "date", "required": True},
                {"key": "fixed_fee_blocks", "label": "Fixed Fee (per period-month block)", "type": "rowgroup", "min_rows": 1, "required": False, "columns": _FIXED_FEE_COLS},
                {"key": "variable_fee_cap_total", "label": "Total Variable Fee Cap", "type": "number", "required": True},
                {"key": "variable_milestone_fee_cap", "label": "Variable Milestone Fee Cap", "type": "number", "required": True},
                {"key": "variable_performance_fee_cap", "label": "Variable Performance Fee Cap", "type": "number", "required": True},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "max": 1, "required": True},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required": True},
            ],
            # Team allocation (17) + auditor allocation (18, hanging) both open,
            # trigger-gated to the planned start date.
            "routing": [{"open": [17, 18]}],
        },
        # ---- Implementation stage (17–20) ----------------------------------
        {
            "task_no": 17,
            "name": "Project Team Allocation",
            "stage": "IM",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_slots": list(_TEAM_ALLOCATION_SLOTS),
            "manpower_source": {"task_no": 16, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 16, "reference_field_key": "planned_start_date"},
            "routing": [{"open": [19]}],
        },
        {
            "task_no": 18,
            "name": "Project Auditor Allocation",
            "stage": "IM",
            # R5: the auditor slots are now real allocation slots (DD7 deferred
            # this from R3's plain-text-field version). Non-blocking (hanging) —
            # opens with Task 17's trigger and never gates the sequence.
            "assignee": "resource_manager",
            "is_hanging_task": True,
            "is_allocation_task": True,
            "allocation_slots": list(_AUDITOR_ALLOCATION_SLOTS),
            # R12: the Resource Manager may staff the auditors *in advance* —
            # while this task is still trigger-``pending``. If both mandatory
            # auditor slots are filled by the time the trigger fires, the task
            # completes itself on open instead of queueing (it routes to nothing,
            # so nothing else is set in motion).
            "auto_close_when_staffed": True,
            "checklist": [],
            "extra_fields": [],
            "trigger": {"reference_task_no": 16, "reference_field_key": "planned_start_date"},
            "routing": [{"open": []}],
        },
        {
            "task_no": 19,
            "name": "Project Initiation",
            "stage": "IM",
            "assignee": "default_bd_person",
            "checklist": _cl(("19.1", "Email sent to initiate Project")),
            "extra_fields": [],
            "routing": [{"open": [20]}],
        },
        {
            "task_no": 20,
            "name": "Implementation",
            "stage": "IM",
            "assignee": "execution_red",
            "checklist": _IMPLEMENTATION_CHECKLIST,
            "extra_fields": _implementation_fields(),
            # Mining (21) + Extension (22) both open trigger-gated (§5, DD5).
            # R6: closing this task snapshots the IM cycle's commercials into
            # project_details (its own stage auto-closes via the ordinary
            # main-sequence stage reconcile, once Closure opens — DD3).
            "on_close": {"project_details": True},
            # ``grants_short_close`` (user, 2026-07-30 — widens TR row 26/§9.2,
            # which granted access only from Task 26): the engagement is live and
            # resources are occupied from here on, so the Resource Manager's
            # escape hatch opens with Implementation and persists through the
            # extension loop. Without this, a project that dies mid-Implementation
            # had no manual route to closure — only Task 20's engagement-end-date
            # trigger, which fires on the *planned* end date however dead the
            # project already is. Still nothing before this: the BD/pre-sale
            # stages (1–19) have their own drop path.
            "grants_short_close": True,
            "routing": [{"open": [21, 22]}],
        },
        # ---- Mining stage (21) — parallel ----------------------------------
        {
            "task_no": 21,
            "name": "Exploit Mining Opportunities",
            "stage": "M",
            "assignee": "default_bd_person",
            # The mining window opening is announced louder than an ordinary task
            # open (``engine._announce_mining_window`` — owner *and* the lead's
            # managers, in place of the generic "a task is ready" note): it fires
            # off a trigger months after go-live, so nobody is watching for it.
            # A task-level marker rather than an ``on_open`` hook because the
            # frontend reads it too, to flag the stage change in-session.
            "is_mining_opportunity": True,
            "checklist": _cl(
                ("21.1", "Visit to client location"),
                ("21.2", "Discussion with key stakeholders"),
                ("21.3", "Area for improvement identified"),
                ("21.4", "Pitch Proposal to Client"),
            ),
            "extra_fields": [
                {"key": "mining_go_ahead", "label": "Is client go-ahead received for a new project?", "type": "boolean", "required": True},
            ],
            # R6: "Yes" spawns a fresh Mining lead (same base_code, parent_lead
            # set, its own BD cycle from Task 1) — the ``spawn_lead`` flag on
            # the matched rule, not an on_close hook, since it's conditional on
            # the answer (engine.complete_task). Leaf either way. Opens X months
            # after Task 20's engagement start (two-rule per the shorter offset
            # when duration < 6 months — trigger config, D8).
            "trigger": {
                "reference_task_no": 20,
                "reference_field_key": "actual_start_date",
                "offset_days": -180,
                "condition": {
                    "field_key": "period_months",
                    "max": 6,
                    "offset_days": -90,
                },
            },
            "routing": [
                {"when": {"field": "mining_go_ahead", "equals": "Yes"}, "open": [], "spawn_lead": True},
                {"open": []},
            ],
        },
        # ---- Extension stage (22–26) — parallel ----------------------------
        {
            "task_no": 22,
            "name": "Extension Proposal",
            # R6: this literal "E1" is a placeholder — the engine resolves the
            # *actual* extension-loop stage dynamically (E1 → E2 → …, entry
            # point or loop-back), see ``engine._attach_stage``. Tasks 23–26
            # below carry the same placeholder and always reuse whichever
            # stage Task 22 just resolved.
            "stage": "E1",
            # D5: either Default BD Person or Execution Red may work it; opener =
            # Default BD (the co-assignee permission is a later-phase concern).
            "assignee": "default_bd_person",
            "checklist": _cl(
                ("22.1", "Discussion with client stakeholders"),
                ("22.2", "Identify area of extension"),
                ("22.3", "Solution design & preparation"),
                ("22.4", "Pitch Extension proposal"),
            ),
            "extra_fields": [
                {"key": "extension_approved", "label": "Extension approved?", "type": "boolean", "required": True},
            ],
            # Approved Yes → Extension Detail (23). No → Project Closure (27).
            # Opens X months before the engagement end date from Task 20 (or 26 for
            # an extension-of-extension); entry point for lead_type = Extension.
            "trigger": {"reference_task_no": 20, "reference_field_key": "modified_planned_end_date", "offset_days": 60},
            "routing": [
                {"when": {"field": "extension_approved", "equals": "No"}, "open": [27], "skip": [23, 24, 25, 26]},
                {"open": [23]},
            ],
        },
        {
            "task_no": 23,
            "name": "Extension Detail",
            "stage": "E1",
            "assignee": "execution_red",
            "checklist": _cl(
                ("23.1", "Addendum Agreement"),
                ("23.2", "Expected variable fee over eligible period submitted"),
            ),
            "extra_fields": [
                {"key": "extended_start_date", "label": "Extended Engagement Start Date", "type": "date", "required": True},
                {"key": "period_months", "label": "Period (months)", "type": "number", "required": True},
                {"key": "planned_end_date", "label": "Planned Ext. Engagement End Date", "type": "date", "required": True},
                # A resource kept engaged past the planned end may carry a zero fee
                # (TR §5, Task 23) — zero is allowed by the global ≥ 0 rule.
                {"key": "fixed_fee", "label": "Fixed Fee", "type": "number", "required": True},
                {"key": "variable_fee_cap_total", "label": "Total Variable Fee Cap", "type": "number", "required": True},
                {"key": "variable_milestone_fee_cap", "label": "Variable Milestone Fee Cap", "type": "number", "required": True},
                {"key": "variable_performance_fee_cap", "label": "Variable Performance Fee Cap", "type": "number", "required": True},
                {"key": "manpower_brown", "label": "Manpower — Brown", "type": "number", "max": 1, "required": True},
                {"key": "manpower_white", "label": "Manpower — White", "type": "number", "required": True},
            ],
            "routing": [{"open": [24]}],
        },
        {
            "task_no": 24,
            "name": "Project Extension Team Allocation",
            "stage": "E1",
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_slots": list(_TEAM_ALLOCATION_SLOTS),
            "manpower_source": {"task_no": 23, "fields": ["manpower_brown", "manpower_white"]},
            "checklist": [],
            "extra_fields": [],
            # Not trigger-gated (§4.12's trigger set is 3/10/17/18/21/22/27; Task 24
            # is not listed): opens immediately when the Extension Detail closes.
            # R5: its team slots prefill from the previous cycle (Implementation on
            # the first extension, the previous Extension loop afterwards) —
            # suggestions only, via ``resources.prefill_suggestions``.
            "routing": [{"open": [25]}],
        },
        {
            "task_no": 25,
            "name": "Project Extension Auditor Allocation",
            "stage": "E1",
            # R5: real auditor allocation slots, like Task 18 but not hanging (DD7)
            # — sequential (24 → 25 → 26), not opened in parallel with 24.
            "assignee": "resource_manager",
            "is_allocation_task": True,
            "allocation_slots": list(_AUDITOR_ALLOCATION_SLOTS),
            "checklist": [],
            "extra_fields": [],
            "routing": [{"open": [26]}],
        },
        {
            "task_no": 26,
            "name": "Extension Implementation",
            "stage": "E1",
            "assignee": "execution_red",
            "checklist": _IMPLEMENTATION_CHECKLIST,
            "extra_fields": _implementation_fields("Ext."),
            # R6: "on open, give Shailesh short-close access" (TR row 26/§9.2) —
            # ``grants_short_close`` (engine.can_short_close): the only natural
            # opener of Task 27 mid-extension-loop is declining the *next*
            # Extension Proposal, so a manual escape hatch is needed while this
            # task itself is open. On close: snapshot this cycle's commercials
            # (its own E{n} stage) into project_details, then close that stage
            # so the loop-back to Task 22 resolves the *next* one (E{n+1}).
            "grants_short_close": True,
            "on_close": {"project_details": True, "close_extension_stage": True},
            # Loops back to Extension Proposal (22) for a possible further extension.
            "routing": [{"open": [22]}],
        },
        # ---- Closure stage (27–28) -----------------------------------------
        {
            "task_no": 27,
            "name": "Project Closure",
            "stage": "Closure",
            "assignee": "execution_red",
            "checklist": _cl(
                ("27.1", "All fixed fee received"),
                ("27.2", "All variable fee received"),
                ("27.3", "All reimbursements received"),
            ),
            "extra_fields": [
                # Not a Yes/No branch like the other booleans — nothing routes on
                # it, it is the closer's confirmation that the project really is
                # done. ``widget: checkbox`` renders it as a single tick box
                # instead of a dropdown (user, 2026-07-30); unticked leaves the
                # field empty, so ``required`` still blocks completion.
                {
                    "key": "final_closed",
                    "label": "Final closed",
                    "type": "boolean",
                    "required": True,
                    "widget": "checkbox",
                    "checkbox_label": "Confirm this project is finally closed",
                },
            ],
            # R5: releases the Implementation/Extension-loop resource allocations
            # the moment this task opens (D11) — see the ``on_open`` doc above.
            # ``is_project_closure`` (R6): lets the engine find this task
            # generically — short-close (engine.open_project_closure) opens it
            # directly, and engine.can_short_close checks whether any instance
            # of it already exists. Completion of the lead is gated on Task 28
            # (R4). Opens via branch (22-No / 12-13 moved-No / short-close) — its
            # date-trigger fallback is not seeded (DD10).
            "is_project_closure": True,
            "on_open": {"release_allocations": True},
            "routing": [{"open": [28]}],
        },
        {
            "task_no": 28,
            "name": "Project Closure — Accounts Approval",
            "stage": "Closure",
            "assignee": "finance",
            "is_finance_gate": True,
            "reopen_on_no": 27,
            # Completion gate (R4, §5.10): a "Yes" here — with Task 27 already
            # closed — flips the lead to Completed. The engine reads this flag so
            # the terminal task number stays out of code.
            "completes_lead": True,
            "checklist": [],
            "extra_fields": [
                {"key": "payment_received", "label": "Payment received against all invoices?", "type": "boolean", "required": True},
                {"key": "remark", "label": "Remark (why payment is outstanding)", "type": "text", "required_when": {"field": "payment_received", "equals": "No"}},
            ],
            # R4: Yes → close + (Task 27 closed →) lead Completed; No → close with
            # remark + re-open Task 27 (§5.10).
            "routing": [{"open": []}],
        },
    ],
}
