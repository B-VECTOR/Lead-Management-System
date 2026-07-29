from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def project_id_snapshot():
    """The shared **display-only** ``project_id`` snapshot column (R9-1, DD-R9-2).

    Stamped once, when the row is created, from the lead's Project ID at that
    moment (``projects.row_project_id``) so every lead-scoped table reads its
    project straight from the DB — the Project ID is the business's primary
    identifier, the numeric ``lead_id`` is just a PK. Continues the 2026-07-27
    meeting pattern already applied to ``lead_stage``/``task_details``.

    **Never a join key** (D1 / §13): joins always key on numeric PKs.
    """
    return models.CharField(
        _("project ID"),
        max_length=50,
        blank=True,
        default="",
        help_text=_(
            "Display snapshot of the lead's Project ID when this row was created; "
            "not a join key (§13)."
        ),
    )


class Lead(models.Model):
    """A lead/project cycle — the unit the workflow runs against.

    Field spec: Tech Req §4.3 / PRD §5.2 (v4.0/v17.0). Per the resolved Phase-3
    decision the company is a plain ``company_name`` text field; there is no
    separate Company entity. ``industry``/``domain`` are FKs into the shared
    reference tables (Tech Req §4.2). Per decision **D2/D7** ``domain`` stays a
    **single** FK (a deliberate deviation from the spec's multi-select), and the
    domain's ``code`` feeds Project-ID generation (§13; base_code built in R2).

    R1 rebuild: ``lead_type`` gains ``Extension``, ``status`` collapses to four
    values (Hybernation / Short Closed retired), and the ``base_code`` /
    ``parent_lead_id`` / ``flow_of_tasks`` / ``type_of_project`` fields are
    introduced. R1 also dropped ``country`` (§5.17) — **re-added 2026-07-28**
    when the user finalized the Project ID composition (§13): Country, Industry,
    Area, Type of Project, Year, Sequence, Stage.
    """

    class LeadType(models.TextChoices):
        BD = "BD", _("BD")
        EXTENSION = "Extension", _("Extension")  # standalone, enters at Task 22 (D10)
        MINING = "Mining", _("Mining")  # spawned off a parent via Task 21 (R6)

    class Status(models.TextChoices):
        IN_PROGRESS = "In Progress", _("In Progress")  # system default on create
        # Member name kept as ON_HOLD to avoid churning every reference; the
        # *value* is "Hold" per Tech Req §4.3.2. Reached via the hold endpoint.
        ON_HOLD = "Hold", _("Hold")  # user — manual (hold/unhold cascade)
        DROPPED = "Dropped", _("Dropped")  # user — manual, or system (Task 8)
        # Member name kept as COMPLETE; value "Completed" per §4.3.2. Set only
        # when both Task 27 and Task 28 close (R4). Never set manually.
        COMPLETE = "Completed", _("Completed")

    # Statuses a user may not set directly. Only ``Completed`` is system-only
    # now (Tech Req §4.3.2); Hold/Dropped are reached through their own
    # endpoints (guarded separately in the serializer).
    SYSTEM_ONLY_STATUSES = frozenset({Status.COMPLETE})

    class FlowOfTasks(models.TextChoices):
        """Which stages run for a BD/Mining lead (§5.3.2 / §4.3.4). Ignored for
        Extension. Short stable codes are stored; the 28-task workflow JSON keys
        its per-flow entry/skip lists off these (decision D6, wired in R3)."""

        DEFAULT = "DEFAULT", _("DEFAULT (2HR → SnT → Proposal)")
        TWO_HR_PROPOSAL = "2HR_PROPOSAL", _("2HR → Project Proposal")
        DIRECT_PROPOSAL = "DIRECT_PROPOSAL", _("Direct Proposal")
        SNT_PROPOSAL = "SNT_PROPOSAL", _("SnT → Project Proposal")

    class TypeOfProject(models.TextChoices):
        """Reporting/filter label **and** a Project-ID segment (§13.4, decision
        2026-07-28). Does not change the task path (D3 / §5.2.2). Stored as the
        display string; :attr:`TYPE_OF_PROJECT_CODES` maps it to its short code."""

        CONSULTING_FULL = "Consulting Full Fledged", _("Consulting Full Fledged")
        AMC = "AMC", _("AMC")
        UPGRADE = "Upgrade", _("Upgrade")
        VECTORFLOW_LITE = "Vectorflow Lite", _("Vectorflow Lite")
        AUDIT_ONLY = "Audit only", _("Audit only")
        CONSULTING_LITE = "Consulting Lite + No software", _("Consulting Lite + No software")

    # Short codes for the Project ID's Type-of-Project segment (§13.4). Unlike
    # Country/Industry/Area — reference *tables* whose codes the business edits
    # in the admin — the six project types are a fixed choice list, so their
    # codes live here beside the choices they belong to.
    TYPE_OF_PROJECT_CODES = {
        TypeOfProject.CONSULTING_FULL: "CFF",
        TypeOfProject.AMC: "AMC",
        TypeOfProject.UPGRADE: "UPG",
        TypeOfProject.VECTORFLOW_LITE: "VFL",
        TypeOfProject.AUDIT_ONLY: "AO",
        TypeOfProject.CONSULTING_LITE: "CLNS",
    }

    # Stable project base `{CountryCode}-{IndustryCode}{AreaCode}{TypeCode}{YY}{Seq}`
    # (§13, D1 as amended 2026-07-28 — e.g. `IN-PHNPDCFF26001`) — generated at
    # lead creation in R2; the column lands here in R1. **Not** DB-unique (R6
    # fix): a Mining child (Task 21) deliberately shares its parent's base_code
    # (§13) — `projects.next_base_sequence`'s own `distinct()` was already
    # written anticipating this share, but the column itself was left
    # `unique=True` until R6 actually exercised the shared-base path and hit the
    # constraint. Uniqueness is enforced logically by `next_base_sequence` (one
    # sequence per year, globally), not by the DB.
    base_code = models.CharField(
        _("project base code"),
        max_length=50,
        null=True,
        blank=True,
        help_text=_(
            "Stable {Country}-{Industry}{Area}{Type}{YY}{Seq}; generated at "
            "creation (R2); shared with Mining children (R6)."
        ),
    )
    # Mining-only linkage (D10): set on a Task-21-spawned lead, pointing at the
    # parent it originated from. Left NULL for BD and Extension-type leads. The
    # field is ``parent_lead`` so Django's DB column is ``parent_lead_id`` (the
    # spec's column name, TR §4.3).
    parent_lead = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mining_children",
        verbose_name=_("parent lead"),
        help_text=_("Set on a Mining-spawned lead (Task 21); NULL otherwise."),
    )
    company_name = models.CharField(_("company name"), max_length=255)
    project_name = models.CharField(_("project name"), max_length=255)
    # Re-added 2026-07-28 (reverses R1's §5.17 drop): Country is captured on the
    # lead again because its code is the Project ID's leading segment (§13).
    # PROTECT for the same reason the other two reference FKs are protected —
    # the lead must keep the row whose code is baked into its Project ID.
    country = models.ForeignKey(
        "reference.Country",
        on_delete=models.PROTECT,
        related_name="leads",
        verbose_name=_("country"),
    )
    industry = models.ForeignKey(
        "reference.Industry",
        on_delete=models.PROTECT,
        related_name="leads",
        verbose_name=_("industry"),
    )
    domain = models.ForeignKey(
        "reference.Area",
        on_delete=models.PROTECT,
        related_name="leads",
        verbose_name=_("domain"),
        help_text=_("Called 'Domain' on the lead form, 'Area' in the workflow sheet."),
    )
    division = models.CharField(_("division"), max_length=255, blank=True)
    scope = models.TextField(_("scope"), blank=True)

    # "Default BD Person". NULL == "Not Assigned": the pre-workflow state a
    # Marketing-created lead sits in until a Lead Admin assigns an owner
    # (Tech Req §4.3.1). Task 1 opens when this transitions NULL→user (Phase 4).
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_leads",
        verbose_name=_("assigned to"),
    )
    lead_type = models.CharField(
        _("lead type"),
        max_length=10,
        choices=LeadType.choices,
        default=LeadType.BD,
    )
    # Which stages run for a BD/Mining lead (§5.3.2). Required for BD/Mining,
    # ignored for Extension — enforced in the serializer; blank at DB level so
    # Extension rows can leave it empty.
    flow_of_tasks = models.CharField(
        _("flow of tasks"),
        max_length=20,
        choices=FlowOfTasks.choices,
        blank=True,
    )
    # Reporting/filter label only (D3); required on every lead.
    type_of_project = models.CharField(
        _("type of project"),
        max_length=40,
        choices=TypeOfProject.choices,
        blank=True,
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
    )

    # Optional reason captured by the drop popup (Tech Req §4.3 v16) — shown
    # as a red banner on the detail page while the lead is Dropped. Written
    # only by the drop action, never by a plain status PATCH.
    drop_remark = models.TextField(_("drop remark"), blank=True)

    # Short-close stamp (R6, PRD §5.12 / Tech Req §9.2). Short-close is a
    # lead-scoped action (it opens the shared Project Closure task and sweeps
    # every open task under the lead) rather than a per-cycle one, so — unlike
    # the pre-R6 model, which stamped these on the "current" `project_details`
    # row — they live directly on the lead. There is no separate status value:
    # a short-closed lead still ends `Completed` like any other closure; this
    # is what lets the detail banner and Project Closure screen show it
    # happened at all, for traceability (§9.2).
    short_close_remark = models.TextField(_("short close remark"), blank=True)
    short_closed_at = models.DateTimeField(_("short closed at"), null=True, blank=True)
    short_closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("short closed by"),
    )

    # Project-ID fields — placeholders in Phase 3; populated by the workflow
    # engine at Task 12 / Task 16 (Tech Req §4.3, §13; Phase 6).
    project_id = models.CharField(_("project ID"), max_length=50, blank=True, default="")
    project_id_base = models.CharField(
        _("project ID base"), max_length=50, blank=True, default=""
    )
    extension = models.CharField(
        _("extension"),
        max_length=2,
        default="00",
        help_text=_("2-digit, zero-padded; increments each Task 16 closure."),
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_leads",
        verbose_name=_("created by"),
    )
    # Lead lifecycle span for dashboards/reports (meeting decision 2026-07-27):
    # ``lead_start_dt`` = when the lead was created; ``lead_end_dt`` = when it
    # first reached a terminal status (Completed or Dropped), NULL while active.
    # ``lead_end_dt`` is stamped centrally in :meth:`save` so every terminal
    # path (completion, auto-drop, manual drop) is covered without editing each.
    lead_start_dt = models.DateTimeField(_("lead start"), default=timezone.now)
    lead_end_dt = models.DateTimeField(_("lead end"), null=True, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        db_table = "lead"
        ordering = ["-created_at"]
        verbose_name = _("lead")
        verbose_name_plural = _("leads")

    def __str__(self):
        return f"{self.company_name} — {self.project_name}"

    def save(self, *args, **kwargs):
        # Stamp the lifecycle end the first time the lead reaches a terminal
        # status; keep it in ``update_fields`` so a targeted save still persists.
        terminal = self.status in (self.Status.COMPLETE, self.Status.DROPPED)
        if terminal and self.lead_end_dt is None:
            self.lead_end_dt = timezone.now()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {"lead_end_dt"}
        super().save(*args, **kwargs)


class LeadStage(models.Model):
    """A stage the lead's workflow passes through (Tech Req §4.4 / PRD §5.3).

    Stage becomes a first-class tracked entity in v4.0/v17.0: every ``Task``
    belongs to a stage, and the derived display Project ID's suffix is resolved
    from the lead's open stage(s) (§13). **Multiple rows may be ``in_progress``
    at once** for a lead — Mining ∥ Extension run in parallel — so there is no
    unique-open constraint here.

    R2 introduces the model, generates the ``base_code`` and opens the **initial**
    stage at lead creation. The per-task stage open/close transitions as the
    28-task workflow advances are wired in R3 (they reuse :func:`ensure_stage`),
    which is why the fixed stage codes are constants here rather than a strict
    ``choices=`` set — the Extension loop codes (``E0``, ``E1``, …) are dynamic.
    """

    # Fixed stage codes (the Extension loops ``E0``/``E1``/… are formed at
    # runtime, so ``stage`` is a plain code string rather than a choices field).
    BD = "BD"
    TWO_HR = "2HR"
    SNT = "SnT"
    IM = "IM"  # Implementation
    MINING = "M"
    CLOSURE = "Closure"

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", _("in progress")
        CLOSED = "closed", _("closed")
        # The flow routed around this whole stage (flow_of_tasks stage-skips, R3).
        SKIPPED = "skipped", _("skipped")

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="stages",
        verbose_name=_("lead"),
    )
    # The stage code drives the Project-ID suffix directly (§13): the suffix is
    # ``-{stage}`` (e.g. BD → ``-BD``, IM → ``-IM``, E0 → ``-E0``, M → ``-M``).
    stage = models.CharField(
        _("stage"),
        max_length=10,
        help_text=_("BD, 2HR, SnT, IM, E0/E1/…, M, or Closure (§4.4)."),
    )
    # Stored display Project ID **snapshot** for this specific stage
    # (``base_code`` + this stage's own suffix, e.g. ``IN-PHNPDCFF26001-IM``). Persisted
    # per meeting decision (2026-07-27) so the value is visible directly in the
    # table; it remains a **display snapshot only** — joins still key on numeric
    # PKs, never on this string (§13). Populated when the stage row is created
    # (``projects.project_id_for_stage``); the lead's *live* current-suffix ID
    # is still derived per request via ``projects.derived_project_id``.
    project_id = models.CharField(
        _("project ID"),
        max_length=50,
        blank=True,
        default="",
        help_text=_("Display snapshot for this stage (base_code + suffix); not a join key (§13)."),
    )
    stage_start_dt = models.DateTimeField(_("stage start"), default=timezone.now)
    stage_end_dt = models.DateTimeField(_("stage end"), null=True, blank=True)
    status = models.CharField(
        _("status"),
        max_length=15,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        db_table = "lead_stage"
        # Chronological — the order stages opened (a mining/extension pair keeps
        # its natural start order for the stepper and dashboard).
        ordering = ["lead", "stage_start_dt", "id"]
        verbose_name = _("lead stage")
        verbose_name_plural = _("lead stages")

    def __str__(self):
        return f"[{self.lead_id}] {self.stage} ({self.status})"

    @property
    def is_open(self):
        return self.status == self.Status.IN_PROGRESS


class Workflow(models.Model):
    """A task graph, stored as JSON, that the engine walks per ``lead_type``.

    Tech Req §4.11 / PRD §5.16: no workflow/sequencing logic is hardcoded in
    the engine — the full 17-task BD sequence (assignees, checklist items,
    extra-field schema, open-conditions, next-task routing/branching) lives in
    the ``workflow`` JSON and is editable from Django admin. The engine only
    knows how to *interpret* the JSON, so future workflow edits (and the future
    Mining flow) need no code change. See ``leads/workflow_data.py`` for the
    seeded BD definition and ``leads/engine.py`` for the interpreter.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", _("active")
        INACTIVE = "inactive", _("inactive")

    name = models.CharField(_("name"), max_length=100)
    type = models.CharField(
        _("type"),
        max_length=10,
        choices=Lead.LeadType.choices,
        default=Lead.LeadType.BD,
    )
    workflow = models.JSONField(_("workflow definition"), default=dict)
    status = models.CharField(
        _("status"),
        max_length=10,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["type", "-status", "name"]
        verbose_name = _("workflow")
        verbose_name_plural = _("workflows")

    def __str__(self):
        return f"{self.name} ({self.type}, {self.status})"


class Task(models.Model):
    """One instance of a workflow step against a lead (Tech Req §4.4).

    There can be **more than one** row per ``(lead, task_no)``: the 7/8
    re-presentation loop and the 13→16 extension cycle re-open the same task
    numbers repeatedly, and each pass is its own row (mirroring the
    one-row-per-cycle model of ``project_details``). ``extra_fields`` holds the
    submitted values for this step's dynamic fields, keyed by field name; the
    schema that drives them lives in the workflow JSON (Tech Req §4.6).
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("pending")  # created, not yet opened (Phase 5)
        OPEN = "open", _("open")
        HOLD = "hold", _("hold")  # Phase 5 hold/unhold
        CLOSED = "closed", _("closed")
        # Routed around by a branch so it can never open (Tech Req §4.4 v14) —
        # or still pending when the lead completed. Excluded from progress.
        SKIPPED = "skipped", _("skipped")
        # The lead was dropped while this task was open/held (Tech Req §4.3.2 v16).
        DROPPED = "dropped", _("dropped")

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="tasks",
        verbose_name=_("lead"),
    )
    # The stage this task belongs to (Tech Req §4.5) — spec says "always set",
    # but it is nullable until R3's 28-task workflow populates it as each task
    # opens (the current 17-task engine is non-functional between R1 and R3 and
    # creates tasks without a stage). Never a join key for the Project ID.
    stage = models.ForeignKey(
        "LeadStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
        verbose_name=_("stage"),
    )
    task_no = models.PositiveIntegerField(_("task no"))
    task_name = models.CharField(_("task name"), max_length=255)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
        verbose_name=_("assigned to"),
    )
    status = models.CharField(
        _("status"),
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
    )
    is_allocation_task = models.BooleanField(_("is allocation task"), default=False)
    # v4.0/v17.0 task flags (Tech Req §4.5). Populated from the workflow JSON when
    # a task opens (R3). ``is_finance_gate`` — tasks 7/15/28, an Accounts gate that
    # can re-open its preceding task on a "No" answer (the re-open transition itself
    # is R4). ``is_hanging_task`` — Task 18, non-blocking: it opens in parallel and
    # its being open never holds up the sequence or the stage close. ``reopened_count``
    # increments each time a Finance gate bounces this task back to ``open`` (R4).
    is_finance_gate = models.BooleanField(_("is finance gate"), default=False)
    is_hanging_task = models.BooleanField(_("is hanging task"), default=False)
    reopened_count = models.PositiveIntegerField(_("reopened count"), default=0)
    extra_fields = models.JSONField(_("extra field values"), default=dict, blank=True)
    # Stored display Project ID **snapshot** for this task, copied from its
    # stage when the task is created/opened (meeting decision 2026-07-27). Same
    # rule as ``LeadStage.project_id``: display only, never a join key (§13).
    project_id = models.CharField(
        _("project ID"),
        max_length=50,
        blank=True,
        default="",
        help_text=_("Display snapshot copied from the task's stage; not a join key (§13)."),
    )
    # ``task_start_dt``/``task_end_dt`` are the spec's column names (§4.5); the
    # verbose names keep the plain "opened/closed" wording the UI uses.
    task_start_dt = models.DateTimeField(_("opened at"), null=True, blank=True)
    task_end_dt = models.DateTimeField(_("closed at"), null=True, blank=True)
    # Total active (non-hold) time — computed in Phase 5 (hold/unhold).
    elapsed_time = models.DurationField(_("elapsed time"), null=True, blank=True)
    # True when this row was swept from open/hold/pending to `skipped` by a
    # short-close (Phase 16) rather than a normal branch route — lets the task
    # view explain *why* it was skipped.
    short_closed = models.BooleanField(_("short closed"), default=False)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        db_table = "task_details"
        # Creation order == chronological workflow progression (loops/cycles
        # append later instances) — clearer for the stepper than task_no order.
        ordering = ["id"]
        verbose_name = _("task")
        verbose_name_plural = _("tasks")

    def __str__(self):
        return f"[{self.lead_id}] Task {self.task_no} — {self.task_name}"

    @property
    def is_editable(self):
        """A task is worked only while ``open`` (closed/hold are locked)."""
        return self.status == self.Status.OPEN


class WorkflowTriggerConfig(models.Model):
    """Date-offset opening rule for a trigger task (Tech Req §4.12 / PRD §5.6).

    Several tasks (2/6/11/13/15) do not open the moment their predecessor
    closes — they open *some days before* a date captured in an earlier task
    (e.g. Task 2 opens before the "expected start date" from Task 1). Rather
    than hardcoding those offsets, each rule is a row here, editable from Django
    admin. The predecessor's closure creates the trigger task in ``pending``
    state (or already ``open`` when the offset date has arrived by then); the
    scheduled job (``open_due_tasks`` management command) flips a pending one to
    ``open`` once ``today >= reference_date - offset_days``.
    """

    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="trigger_configs",
        verbose_name=_("workflow"),
    )
    task_no = models.PositiveIntegerField(
        _("task no"),
        help_text=_("The trigger task this rule controls (e.g. 2, 6, 11, 13, 15)."),
    )
    reference_task_no = models.PositiveIntegerField(
        _("reference task no"),
        help_text=_("The earlier task whose date field is the reference point."),
    )
    reference_field_key = models.CharField(
        _("reference field key"),
        max_length=100,
        help_text=_("Field key on the reference task holding the date (e.g. expected_start_date)."),
    )
    offset_days = models.IntegerField(
        _("offset days"),
        default=0,
        help_text=_(
            "Signed. The task opens on reference_date − offset_days: a positive "
            "value opens it that many days BEFORE the reference date, a negative "
            "value that many days AFTER (e.g. Task 21 opens months after the "
            "engagement start). 0 = opens on the date itself."
        ),
    )
    # Task-21 two-rule variant (Tech Req §4.12): a second config row can carry a
    # condition so a shorter offset applies only when the reference task's duration
    # is short. When ``condition_field_key`` is set, this rule is eligible only if
    # that numeric field on the reference task is ≤ ``condition_max``. A row with no
    # condition is the unconditional default. R3 seeds the pair; admin tunes them (D8).
    condition_field_key = models.CharField(
        _("condition field key"),
        max_length=100,
        blank=True,
        default="",
        help_text=_("Optional: numeric field on the reference task this rule is gated on (e.g. period_months)."),
    )
    condition_max = models.DecimalField(
        _("condition max"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_("This rule applies only when the condition field is ≤ this value."),
    )
    is_active = models.BooleanField(_("is active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["workflow", "task_no"]
        # No unique (workflow, task_no) constraint: Task 21's two-rule variant needs
        # two rows for one task_no (a conditional one + the default). Seeding keys on
        # (workflow, task_no, condition_field_key) so re-runs stay idempotent (§4.12).
        constraints = [
            models.UniqueConstraint(
                fields=["workflow", "task_no", "condition_field_key"],
                name="uniq_trigger_per_workflow_task_condition",
            )
        ]
        verbose_name = _("workflow trigger config")
        verbose_name_plural = _("workflow trigger configs")

    def __str__(self):
        return f"{self.workflow_id}: task {self.task_no} ← task {self.reference_task_no}.{self.reference_field_key} − {self.offset_days}d"


class HoldRecord(models.Model):
    """Shared shape for a single hold→unhold interval (Tech Req §4.9).

    Each row is one pause: ``hold_at``/``hold_by`` when paused, and
    ``unhold_at``/``unhold_by`` filled in when resumed (NULL while still held).
    Elapsed/active time subtracts the sum of these intervals from a task's total
    open duration.
    """

    hold_at = models.DateTimeField(_("hold at"), default=timezone.now)
    hold_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name=_("hold by"),
    )
    # Why this pause was taken — captured at hold time and kept on the interval
    # itself (not only the activity log) so the hold trail carries its own
    # reason across repeated hold→unhold cycles (Phase 13).
    reason = models.TextField(_("reason"), blank=True)
    unhold_at = models.DateTimeField(_("unhold at"), null=True, blank=True)
    unhold_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("unhold by"),
    )
    # Why the pause was lifted — captured by the unhold popup (optional), so the
    # trail carries both sides of every cycle (Tech Req §4.9 v16).
    unhold_reason = models.TextField(_("unhold reason"), blank=True)

    class Meta:
        abstract = True
        ordering = ["-hold_at"]

    @property
    def is_open(self):
        """True while this hold is still active (not yet unheld)."""
        return self.unhold_at is None


class LeadHold(HoldRecord):
    """A lead-level hold interval — pauses the whole lead (Tech Req §4.9, §6)."""

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="holds",
        verbose_name=_("lead"),
    )
    project_id = project_id_snapshot()

    class Meta(HoldRecord.Meta):
        abstract = False
        verbose_name = _("lead hold")
        verbose_name_plural = _("lead holds")

    def __str__(self):
        return f"LeadHold[{self.lead_id}] {self.hold_at:%Y-%m-%d}"


class TaskHold(HoldRecord):
    """A task-level hold interval — pauses one task (Tech Req §4.9, §6)."""

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="holds",
        verbose_name=_("task"),
    )

    class Meta(HoldRecord.Meta):
        abstract = False
        verbose_name = _("task hold")
        verbose_name_plural = _("task holds")

    def __str__(self):
        return f"TaskHold[{self.task_id}] {self.hold_at:%Y-%m-%d}"


class ResourceAllocation(models.Model):
    """Append-only resource-allocation history (Tech Req §4.7 / PRD §5.7 — R5 rebuild).

    One row per resource, per slot, per stage — **never overwritten**. Filling a
    slot inserts an ``allocated`` row; moving a person off it releases that row
    (``released_on`` stamped) and, for a reassignment, the new row's ``replaces``
    links back to it — so who held a slot, for how long, and who replaced them
    all survive for the resource-history dashboard.

    Replaces the old wide single-row-per-cycle table (``Type`` + 16 single-
    holder slots incl. ``project_member1..10``/``auditor3-4``), retired in
    migration ``0020``. The 5 slots below are the full set per Tech Req §4.7;
    White is the only slot a stage may need more than one of at a time — every
    other slot holds at most one currently-``allocated`` row
    (:data:`SINGLE_OCCUPANCY_SLOTS`).
    """

    class Slot(models.TextChoices):
        EXECUTION_RED = "execution_red", _("Execution Red")
        EXECUTION_BROWN = "execution_brown", _("Execution Brown")
        WHITE = "white", _("White")
        AUDITOR_1 = "auditor_1", _("Auditor 1")
        AUDITOR_2 = "auditor_2", _("Auditor 2")

    # Slots capped at one *currently allocated* row — a second fill must go
    # through reassignment (release + replace), never a second concurrent row.
    SINGLE_OCCUPANCY_SLOTS = (
        Slot.EXECUTION_RED,
        Slot.EXECUTION_BROWN,
        Slot.AUDITOR_1,
        Slot.AUDITOR_2,
    )

    class Status(models.TextChoices):
        ALLOCATED = "allocated", _("Allocated")  # currently occupying the slot
        RELEASED = "released", _("Released")  # freed — history only

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="resource_allocations",
        verbose_name=_("lead"),
        help_text=_("Denormalized for reporting (§4.7)."),
    )
    project_id = project_id_snapshot()
    stage = models.ForeignKey(
        LeadStage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resource_allocations",
        verbose_name=_("stage"),
        help_text=_("Which stage this slot's occupant is working (§4.7)."),
    )
    # The allocation task instance that created this row (traceability; a lead
    # gets a fresh row per allocation task across BD/SnT/Implementation/Extension
    # cycles — 3/10/17/18/24/25). DB column is ``task_id`` (the spec's name, §4.7).
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resource_allocations",
        verbose_name=_("allocation task"),
    )
    slot = models.CharField(_("slot"), max_length=20, choices=Slot.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("user"),
    )
    is_tbd = models.BooleanField(
        _("is TBD"),
        default=False,
        help_text=_("White only — a slot may be left to-be-decided (PRD §5.7)."),
    )
    # Denormalized display name of the occupant (meeting decision 2026-07-27) —
    # a snapshot of ``user.name`` (or "TBD" for a TBD White slot, "" when empty)
    # kept alongside the ``user`` FK so dashboards/reports can read the name
    # without a join. Written on allocate/reassign; the FK stays the source of truth.
    names = models.CharField(_("names"), max_length=255, blank=True, default="")
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.ALLOCATED,
    )
    allocated_on = models.DateTimeField(_("allocated on"), default=timezone.now)
    released_on = models.DateTimeField(_("released on"), null=True, blank=True)
    replaces = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replaced_by",
        verbose_name=_("replaces"),
        help_text=_("Set when this row replaces a reassigned one — the replaced "
                     "row is set to released (§4.7)."),
    )
    man_power_required = models.PositiveIntegerField(
        _("man power required"),
        default=0,
        help_text=_("Headcount required for this slot, captured from the "
                     "triggering stage's manpower fields — feeds the "
                     "over/under-allocation indicators."),
    )
    remark = models.TextField(_("remark"), blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        db_table = "resource_table"
        ordering = ["-allocated_on", "-id"]
        verbose_name = _("resource allocation")
        verbose_name_plural = _("resource allocations")

    def __str__(self):
        who = self.user.name if self.user_id else ("TBD" if self.is_tbd else "—")
        return f"[{self.lead_id}] {self.get_slot_display()} — {who} ({self.status})"


class ProjectDetails(models.Model):
    """One row per implementation/extension cycle — the commercial history
    (Tech Req §4.8 / PRD §5.15, §9.2 — R6 rebuild).

    Inserted when Task 20 (Implementation) or Task 26 (Extension Implementation)
    closes: one immutable snapshot per completed IM/E{n} cycle, keyed to the
    :class:`LeadStage` it closed (never a stored join key elsewhere — see
    ``projects.derived_project_id``). Backs the Project Closure screen (§9.2),
    which lists every cycle across a project's ``base_code`` family (a parent
    lead plus any Mining children share one ``base_code`` — §13) together, so
    implementation, each extension loop, and any mining lead's own cycles all
    show up without a special case.

    Display ``status`` for the closure screen is **derived** from
    ``stage.status`` (in_progress/closed/skipped) rather than duplicated here —
    Tech Req §4.8's field list is exactly the six below. A cycle that a
    short-close cut short before its closing task ever completed gets no row
    here (there are no finalized commercials to snapshot — see
    ``engine.open_project_closure``); the short-close stamp lives on
    :attr:`Lead.short_close_remark` instead, since short-close is a lead-scoped
    action now, not a per-cycle one (R5→R6: the old wide shape — ``extension_no``
    / ``project_id_base`` / ``status`` / ``is_current`` / the short-close
    columns — is retired).
    """

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="project_details",
        verbose_name=_("lead"),
    )
    stage = models.ForeignKey(
        LeadStage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_details",
        verbose_name=_("stage"),
        help_text=_("The IM/E{n} cycle this commercial record belongs to (§4.8)."),
    )
    project_id = models.CharField(
        _("project ID"),
        max_length=50,
        help_text=_("The derived display Project ID, snapshotted at generation time."),
    )
    # Explicit stage-code label for this cycle (meeting decision 2026-07-27):
    # ``IM`` / ``E0``/``E1``… / ``M`` — a denormalized copy of ``stage.stage`` so
    # reports can read the cycle type directly without joining to lead_stage.
    project = models.CharField(
        _("project"),
        max_length=10,
        blank=True,
        default="",
        help_text=_("Stage code for this cycle (IM / E{n} / M); copy of stage.stage."),
    )
    fixed_fee = models.DecimalField(
        _("fixed fee"), max_digits=14, decimal_places=2, default=0,
    )
    variable_fee = models.DecimalField(
        _("variable fee"), max_digits=14, decimal_places=2, default=0,
    )
    generated_at = models.DateTimeField(_("generated at"), default=timezone.now)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_project_details",
        verbose_name=_("generated by"),
    )

    class Meta:
        db_table = "project_details"
        ordering = ["lead", "generated_at", "id"]
        verbose_name = _("project details")
        verbose_name_plural = _("project details")

    def __str__(self):
        return self.project_id


class Followup(models.Model):
    """An ad-hoc follow-up raised against a lead (Tech Req §4.10 / PRD §5.11).

    Raised by a Lead Manager and assigned to an Employee-role user (or the Lead
    Manager themself); surfaced on the shared **"Other Tasks"** screen for
    whichever user it is assigned to. The docs' minimal shape is
    lead/assignee/created_by/followup_date/remark/status; per the confirmed
    Phase-7 decision (2026-07-10) the frontend's ``title`` and its chat-style
    comment thread (:class:`FollowupUpdate`) are **kept** on top of that shape.
    """

    class Status(models.TextChoices):
        OPEN = "open", _("open")
        DONE = "done", _("done")

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="followups",
        verbose_name=_("lead"),
    )
    project_id = project_id_snapshot()
    # Kept beyond the docs' field list per the confirmed Phase-7 decision.
    title = models.CharField(_("title"), max_length=255)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assigned_followups",
        verbose_name=_("assigned to"),
        help_text=_("An Employee-role user, or the Lead Manager themself."),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_followups",
        verbose_name=_("created by"),
    )
    followup_date = models.DateField(
        _("follow-up date"),
        help_text=_("Must not be a past date (§3)."),
    )
    remark = models.TextField(_("remark"), blank=True)
    status = models.CharField(
        _("status"),
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["status", "followup_date", "id"]
        verbose_name = _("follow-up")
        verbose_name_plural = _("follow-ups")

    def __str__(self):
        return f"[{self.lead_id}] {self.title} ({self.status})"


class FollowupUpdate(models.Model):
    """One comment in a follow-up's chat-style progress thread.

    Kept beyond the docs' minimal follow-up shape per the confirmed Phase-7
    decision (2026-07-10): anyone who can see the follow-up may leave a comment
    so others see progress; closing the follow-up is a separate terminal action
    (may carry a final comment).
    """

    followup = models.ForeignKey(
        Followup,
        on_delete=models.CASCADE,
        related_name="updates",
        verbose_name=_("follow-up"),
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="followup_updates",
        verbose_name=_("author"),
    )
    comment = models.TextField(_("comment"))
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        # Oldest first — the thread reads top-to-bottom, newest appended.
        ordering = ["created_at", "id"]
        verbose_name = _("follow-up update")
        verbose_name_plural = _("follow-up updates")

    def __str__(self):
        return f"[{self.followup_id}] {self.author_id}: {self.comment[:40]}"


def attachment_upload_path(instance, filename):
    """Store lead attachments under a per-lead folder (Tech Req §15 / Decision #4)."""
    return f"leads/{instance.lead_id}/{filename}"


class Attachment(models.Model):
    """A file uploaded against a lead — the Lead Detail "Files" tab (Decision #4).

    Kept lead-scoped: the only place the frontend uploads files today is a lead
    (``entity_type='lead'``). A 5 MB size cap is enforced at the serializer
    level (PRD §5.14 numeric/global rules extend to uploads per Phase-8 scope).
    """

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="attachments",
        verbose_name=_("lead"),
    )
    project_id = project_id_snapshot()
    file = models.FileField(_("file"), upload_to=attachment_upload_path)
    filename = models.CharField(_("filename"), max_length=255)
    title = models.CharField(_("title"), max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_attachments",
        verbose_name=_("uploaded by"),
    )
    uploaded_at = models.DateTimeField(_("uploaded at"), auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at", "-id"]
        verbose_name = _("attachment")
        verbose_name_plural = _("attachments")

    def __str__(self):
        return f"[{self.lead_id}] {self.title or self.filename}"


class ActivityLog(models.Model):
    """An auto-logged, timestamped event on a lead (PRD §6 activity-log rows;
    NFR §7 "every action should be timestamped and attributable to a user").

    Written by the API/service layer at the moments an event happens (lead
    created, owner assigned, task completed/reassigned, hold/unhold, resources
    allocated, follow-up raised) and surfaced read-only on the Lead Detail
    "Activity" tab. Visibility follows lead visibility (a Lead Admin sees every
    lead's log, a Lead Manager their own leads') — the §6 "own vs all activity"
    rows.
    """

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name=_("lead"),
    )
    project_id = project_id_snapshot()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_events",
        verbose_name=_("actor"),
    )
    type = models.CharField(_("type"), max_length=40)
    summary = models.CharField(_("summary"), max_length=255)
    body = models.TextField(_("body"), blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = _("activity log entry")
        verbose_name_plural = _("activity log")

    def __str__(self):
        return f"[{self.lead_id}] {self.type}: {self.summary[:40]}"


class Notification(models.Model):
    """An in-app notification for one user (Decision #4 — kept in this build).

    Generated automatically at the events the docs flag as notification-worthy
    (task opened, task reassigned, follow-up due, owner assignment). Read via
    the bell / Notifications page and marked read individually or in bulk.
    """

    class Type(models.TextChoices):
        LEAD_ASSIGNED = "lead_assigned", _("lead assigned")
        TASK_OPENED = "task_opened", _("task opened")
        TASK_REASSIGNED = "task_reassigned", _("task reassigned")
        TASK_COMPLETED = "task_completed", _("task completed")
        FOLLOWUP = "followup", _("follow-up")
        LEAD_HELD = "lead_held", _("lead put on hold")
        TASK_HELD = "task_held", _("task put on hold")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name=_("user"),
    )
    type = models.CharField(_("type"), max_length=40, choices=Type.choices)
    message = models.CharField(_("message"), max_length=255)
    link = models.CharField(_("link"), max_length=255, blank=True)
    is_read = models.BooleanField(_("is read"), default=False)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = _("notification")
        verbose_name_plural = _("notifications")

    def __str__(self):
        return f"[{self.user_id}] {self.type}: {self.message[:40]}"


class Checklist(models.Model):
    """A single checklist item on a task (Tech Req §4.5).

    Saved independently of task closure — each status/remark edit persists
    immediately and stamps ``last_edited_at``/``last_edited_by``. Items may be
    un-checked (no lock-in). A task closes only once every item is ``complete``.
    """

    class Status(models.TextChoices):
        NOT_STARTED = "not_started", _("not started")
        IN_PROGRESS = "inprogress", _("in progress")
        COMPLETE = "complete", _("complete")

    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="checklist_items",
        verbose_name=_("task"),
    )
    item_key = models.CharField(_("item key"), max_length=20)
    item_label = models.CharField(_("item label"), max_length=255)
    status = models.CharField(
        _("status"),
        max_length=15,
        choices=Status.choices,
        default=Status.NOT_STARTED,
    )
    remark = models.TextField(_("remark"), blank=True)
    last_edited_at = models.DateTimeField(_("last edited at"), null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_checklist_items",
        verbose_name=_("last edited by"),
    )

    class Meta:
        ordering = ["id"]
        verbose_name = _("checklist item")
        verbose_name_plural = _("checklist items")

    def __str__(self):
        return f"{self.item_key} {self.item_label}"
