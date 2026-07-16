from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Lead(models.Model):
    """A BD (or, future, Mining) lead — the unit the BD workflow runs against.

    Field spec: Tech Req §4.3 / PRD §5.2. Per the resolved Phase-3 decision the
    company is a plain ``company_name`` text field (both governing docs model it
    that way); there is no separate Company entity. ``country``/``industry``/
    ``domain`` are FKs into the shared reference tables (Tech Req §4.2), whose
    ``code`` values later feed Project-ID generation (§13, Phase 6).
    """

    class LeadType(models.TextChoices):
        BD = "BD", _("BD")
        MINING = "Mining", _("Mining")  # future scope (Decision #6)

    class Status(models.TextChoices):
        IN_PROGRESS = "In Progress", _("In Progress")  # system default on create
        ON_HOLD = "On Hold", _("On Hold")  # user — manual (Phase 5 cascade)
        DROPPED = "Dropped", _("Dropped")  # user — manual
        HYBERNATION = "Hybernation", _("Hybernation")  # system only (Task 12)
        COMPLETE = "Complete", _("Complete")  # system only (Task 17)

    # Statuses a user may not set directly; Hybernation/Complete are system-only
    # (Tech Req §4.3.2) and enforced in the serializer.
    SYSTEM_ONLY_STATUSES = frozenset({Status.HYBERNATION, Status.COMPLETE})

    country = models.ForeignKey(
        "reference.Country",
        on_delete=models.PROTECT,
        related_name="leads",
        verbose_name=_("country"),
    )
    company_name = models.CharField(_("company name"), max_length=255)
    project_name = models.CharField(_("project name"), max_length=255)
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
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS,
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
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("lead")
        verbose_name_plural = _("leads")

    def __str__(self):
        return f"{self.company_name} — {self.project_name}"


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

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="tasks",
        verbose_name=_("lead"),
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
    extra_fields = models.JSONField(_("extra field values"), default=dict, blank=True)
    opened_at = models.DateTimeField(_("opened at"), null=True, blank=True)
    closed_at = models.DateTimeField(_("closed at"), null=True, blank=True)
    # Total active (non-hold) time — computed in Phase 5 (hold/unhold).
    elapsed_time = models.DurationField(_("elapsed time"), null=True, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
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
    state; the scheduled job (``open_due_tasks`` management command) flips it to
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
    offset_days = models.PositiveIntegerField(
        _("offset days"),
        default=0,
        help_text=_("Days before the reference date the task opens. 0 = opens on the date itself."),
    )
    is_active = models.BooleanField(_("is active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        ordering = ["workflow", "task_no"]
        constraints = [
            models.UniqueConstraint(
                fields=["workflow", "task_no"],
                name="uniq_trigger_per_workflow_task",
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
    """Resources allocated for one workflow stage (Tech Req §4.7 / PRD §5.7).

    A row is created the moment an allocation task (2/6/11/15) opens — in
    ``Pending`` status, with all resource FKs empty and ``man_power_required``
    copied from the triggering stage's upstream manpower fields. The Resource
    Manager fills it in and submits (``Open``); resources free up automatically
    (``Closed``) per the type-specific auto-close rules (2HR@Task 4, SNT@Task 9,
    Implementation/Extension@lead-Complete). Owned and edited by the Resource
    Manager only.
    """

    # Single-holder resource slots (one user each), in form order. Execution
    # Red drives the next task's assignee (``latest_execution_red``). Execution
    # Brown is a single holder too (Phase 12, per the user — one Brown per
    # stage). Only White is multi-select (``MULTI_RESOURCE_FIELDS``).
    SINGLE_RESOURCE_FIELDS = (
        "execution_red",
        "execution_brown",
        "auditor1",
        "auditor2",
        "auditor3",
        "auditor4",
        "project_member1",
        "project_member2",
        "project_member3",
        "project_member4",
        "project_member5",
    )
    # Multi-holder slots (many users each) — only White now. White may be left
    # empty ("TBD allowed", PRD §5.7).
    MULTI_RESOURCE_FIELDS = (
        "whites",
    )
    # All resource-holding field names (kept for callers that iterate every slot).
    RESOURCE_FIELDS = SINGLE_RESOURCE_FIELDS + MULTI_RESOURCE_FIELDS

    class Type(models.TextChoices):
        TWO_HR = "2HR", _("2Hr Study & Presentation")
        SNT = "SNT", _("Solution Blueprint")
        IMPLEMENTATION = "Implementation", _("Implementation")
        EXTENSION = "Extension", _("Extension")

    class Status(models.TextChoices):
        PENDING = "Pending", _("Pending")  # row created, not yet filled
        OPEN = "Open", _("Open")  # submitted — resources actively allocated
        CLOSED = "Closed", _("Closed")  # freed up (auto-close rules)

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="resource_allocations",
        verbose_name=_("lead"),
    )
    # The allocation task instance that spawned this row (traceability; a lead
    # can have repeat rows of a type across extension cycles).
    allocation_task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resource_allocations",
        verbose_name=_("allocation task"),
    )
    type = models.CharField(_("type"), max_length=20, choices=Type.choices)

    execution_red = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("execution red"),
    )
    # Execution Brown is a single holder (Phase 12). White is multi-select: a
    # stage can need several, and White may be left empty — TBD is allowed
    # (PRD §5.7).
    execution_brown = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("execution brown"),
    )
    whites = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="+", blank=True,
        verbose_name=_("whites"),
        help_text=_("May be left empty — TBD is allowed (PRD §5.7)."),
    )
    auditor1 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("auditor 1"),
    )
    auditor2 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("auditor 2"),
    )
    auditor3 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("auditor 3"),
    )
    auditor4 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("auditor 4"),
    )
    project_member1 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("project member 1"),
    )
    project_member2 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("project member 2"),
    )
    project_member3 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("project member 3"),
    )
    project_member4 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("project member 4"),
    )
    project_member5 = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+", verbose_name=_("project member 5"),
    )

    remark = models.TextField(_("remark"), blank=True)
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.PENDING,
    )
    man_power_required = models.PositiveIntegerField(
        _("man power required"),
        default=0,
        help_text=_("Total headcount captured from the triggering stage (Brown + White)."),
    )
    # The Brown/White split of the required man-power, captured upstream and
    # preserved so the Resource Manager sees exactly how many of each is needed
    # (not just the total) and over-allocation is checked per belt.
    man_power_brown = models.PositiveIntegerField(_("man power required — brown"), default=0)
    man_power_white = models.PositiveIntegerField(_("man power required — white"), default=0)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    closed_at = models.DateTimeField(_("closed at"), null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = _("resource allocation")
        verbose_name_plural = _("resource allocations")

    def __str__(self):
        return f"[{self.lead_id}] {self.type} ({self.status})"

    @property
    def brown_count(self):
        return 1 if self.execution_brown_id else 0

    @property
    def white_count(self):
        return self.whites.count()

    @property
    def allocated_count(self):
        """Total resources the Resource Manager has assigned (single slots incl.
        Execution Brown, plus the White multi-select members)."""
        singles = sum(
            1 for f in self.SINGLE_RESOURCE_FIELDS if getattr(self, f"{f}_id") is not None
        )
        return singles + self.white_count

    @property
    def is_over_allocated(self):
        """Red exceeded-indicator (§4.7): more Whites assigned than the upstream
        man-power figure calls for (Brown is a single holder now, capped at 1).
        Checked per belt; a required figure of 0 means "not captured", so it
        never flags.
        """
        brown_over = self.man_power_brown > 0 and self.brown_count > self.man_power_brown
        white_over = self.man_power_white > 0 and self.white_count > self.man_power_white
        return brown_over or white_over


class ProjectDetails(models.Model):
    """One row per implementation/extension cycle — the Project ID history
    (Tech Req §4.8 / PRD §5.15).

    ``leads.project_id`` only ever holds the *current* value, so every Project
    ID a lead has had is preserved here — inserted when Task 12 (Implementation)
    closes and again on each Task 16 (Extension Implementation) closure. Backs
    the one-row-per-cycle Project Closure screen (§9.2).
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "In Progress", _("In Progress")  # the active cycle
        EXTENDED = "Extended", _("Extended")  # superseded by a further extension
        COMPLETE = "Complete", _("Complete")  # final closure happened here

    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="project_details",
        verbose_name=_("lead"),
    )
    resource_allocation = models.ForeignKey(
        ResourceAllocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_details",
        verbose_name=_("resource allocation"),
    )
    extension_no = models.CharField(_("extension no"), max_length=2, default="00")
    project_id = models.CharField(_("project ID"), max_length=50)
    project_id_base = models.CharField(_("project ID base"), max_length=50)
    status = models.CharField(
        _("status"), max_length=15, choices=Status.choices, default=Status.IN_PROGRESS,
    )
    is_current = models.BooleanField(_("is current"), default=True)
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
        ordering = ["lead", "extension_no"]
        verbose_name = _("project details")
        verbose_name_plural = _("project details")

    def __str__(self):
        return f"{self.project_id} ({self.status})"


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
