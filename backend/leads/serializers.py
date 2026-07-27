from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from . import engine, projects, resources
from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    FollowupUpdate,
    Lead,
    LeadStage,
    Notification,
    ProjectDetails,
    ResourceAllocation,
    Task,
    TaskHold,
)
from .permissions import (
    LEAD_ADMIN,
    LEAD_MANAGER,
    MARKETING,
    can_edit_task,
    can_hold_task,
    can_reassign_task,
    exclude_user_management,
    user_role_names,
)

User = get_user_model()


class AssignableUserSerializer(serializers.ModelSerializer):
    """Minimal identity for the lead form's "Assigned To" (owner) dropdown."""

    class Meta:
        model = User
        fields = ["id", "name", "username"]


class LeadSerializer(serializers.ModelSerializer):
    """Lead CRUD serializer with role-aware ``assigned_to`` and status guards.

    Read responses carry ``*_name`` convenience fields so the frontend list can
    render industry/domain/owner without a second lookup. Writes still use the
    FK ids. ``created_by``, ``base_code`` and the Project-ID fields are
    system-managed (read-only); ``status`` is writable but may not be set to a
    system-only value (Tech Req §4.3.2).
    """

    # Only active, non-deleted users may own a lead. ("BD users" is not further
    # defined in the docs; not over-restricted here — see PLAN Phase-3 note.)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=exclude_user_management(User.objects.filter(is_active=True)),
        required=False,
        allow_null=True,
    )

    industry_name = serializers.CharField(source="industry.name", read_only=True)
    domain_name = serializers.CharField(source="domain.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    # Checklist/task completion % for the leads table + detail progress card.
    # Computed the same way the dashboard does (closed tasks / total tasks);
    # read-only and additive — uses the prefetched ``tasks`` when available.
    progress = serializers.SerializerMethodField()
    # The §4.3.3 v16 tracker payload ({total, closed, percent}) + the lead's
    # current active task, feeding the Tracker column and Current-Task filter.
    task_progress = serializers.SerializerMethodField()
    current_task = serializers.SerializerMethodField()
    # True when any task under the lead is currently on hold — drives a "Task on
    # hold" flag in the leads list even while the lead itself is In Progress
    # (Phase 13; a single held task doesn't change lead.status).
    has_held_task = serializers.SerializerMethodField()
    # A human-readable Lead ID (Phase 9 — no such concept exists in the docs;
    # confirmed with the user). Deliberately shaped unlike a Project ID
    # ("IN-PHNPD26001-I00") so the two are never confused before a lead has
    # actually generated one.
    lead_display_id = serializers.SerializerMethodField()
    # The still-open hold interval while the lead is On Hold (Tech Req §5.8/§4.9
    # v16) — drives the amber "on hold" banner (reason + who/when) on detail.
    active_hold = serializers.SerializerMethodField()
    # The lead's short-close stamp (R6, PRD §5.12/§9.2) — drives the blue
    # "short-closed" banner on detail. Short-close is a lead-scoped action now
    # (it opens the shared Project Closure task), so this reads straight off
    # the lead's own columns rather than a "current" project_details row.
    short_close_info = serializers.SerializerMethodField()
    # Whether the Resource Manager's short-close action is currently available
    # (engine.can_short_close) — surfaced so the Lead Detail action button can
    # gate itself without a second lookup.
    can_short_close = serializers.SerializerMethodField()
    # R2 (Tech Req §13): the stage-legible **derived** Project ID
    # (``base_code [+ -M] + -{current_stage}``) and the lead's current stage.
    # Both are computed from the ``base_code`` + open ``lead_stage`` rows on
    # every read — never stored as a join key. Replaces the old stored
    # ``project_id`` for display (that column is left empty by the retired
    # 17-task path and is redone per-cycle in R4/R6).
    project_id_display = serializers.SerializerMethodField()
    current_stage = serializers.SerializerMethodField()

    class Meta:
        model = Lead
        fields = [
            "id",
            "base_code",
            "parent_lead",
            "company_name",
            "project_name",
            "industry",
            "industry_name",
            "domain",
            "domain_name",
            "division",
            "scope",
            "assigned_to",
            "assigned_to_name",
            "lead_type",
            "flow_of_tasks",
            "type_of_project",
            "status",
            "progress",
            "task_progress",
            "current_task",
            "has_held_task",
            "lead_display_id",
            "drop_remark",
            "active_hold",
            "short_close_info",
            "can_short_close",
            "project_id_display",
            "current_stage",
            "project_id",
            "project_id_base",
            "extension",
            "lead_start_dt",
            "lead_end_dt",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "base_code",
            "parent_lead",
            "lead_start_dt",
            "lead_end_dt",
            "progress",
            "task_progress",
            "current_task",
            "has_held_task",
            "lead_display_id",
            "drop_remark",
            "active_hold",
            "short_close_info",
            "can_short_close",
            "project_id_display",
            "current_stage",
            "project_id",
            "project_id_base",
            "extension",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def _real_tasks(self, obj):
        # Skipped steps (branch-routed-around) are not real work — excluded
        # from the tracker denominator so it reflects remaining work (§5.18).
        return [
            t for t in obj.tasks.all()  # uses the prefetch cache when prefetched
            if t.status != Task.Status.SKIPPED
        ]

    def get_progress(self, obj):
        tasks = self._real_tasks(obj)
        total = len(tasks)
        if total == 0:
            return 0
        closed = sum(1 for t in tasks if t.status == Task.Status.CLOSED)
        return round(closed / total * 100)

    def get_task_progress(self, obj):
        # The §4.3.3 v16 tracker shape: closed/total task instances + percent.
        tasks = self._real_tasks(obj)
        total = len(tasks)
        closed = sum(1 for t in tasks if t.status == Task.Status.CLOSED)
        percent = round(closed / total * 100) if total else 0
        return {"total": total, "closed": closed, "percent": percent}

    def get_current_task(self, obj):
        # The lowest-numbered task currently being worked (open/hold) — feeds
        # the leads-table "Current Task" filter (§4.3.3 v16). None when nothing
        # is active (not started, dropped, or complete).
        active = [
            t for t in obj.tasks.all()
            if t.status in (Task.Status.OPEN, Task.Status.HOLD)
        ]
        if not active:
            return None
        current = min(active, key=lambda t: (t.task_no, t.id))
        return {"task_no": current.task_no, "task_name": current.task_name}

    def get_has_held_task(self, obj):
        return any(t.status == Task.Status.HOLD for t in obj.tasks.all())

    def get_lead_display_id(self, obj):
        return f"LD-{obj.created_at.year}-{obj.id:05d}"

    def get_active_hold(self, obj):
        if obj.status != Lead.Status.ON_HOLD:
            return None
        hold = (
            obj.holds.filter(unhold_at__isnull=True)
            .select_related("hold_by")
            .order_by("-hold_at")
            .first()
        )
        if hold is None:
            return None
        return {
            "reason": hold.reason,
            "hold_at": hold.hold_at,
            "hold_by_name": hold.hold_by.name if hold.hold_by else None,
        }

    def get_short_close_info(self, obj):
        if obj.short_closed_at is None:
            return None
        return {
            "short_closed_at": obj.short_closed_at,
            "short_closed_by_name": obj.short_closed_by.name if obj.short_closed_by else None,
            "remark": obj.short_close_remark,
        }

    def get_can_short_close(self, obj):
        return engine.can_short_close(obj)

    def get_project_id_display(self, obj):
        return projects.derived_project_id(obj)

    def get_current_stage(self, obj):
        stage = projects.current_stage(obj)
        if stage is None:
            return None
        return {"stage": stage.stage, "status": stage.status}

    def validate_status(self, value):
        if value in Lead.SYSTEM_ONLY_STATUSES:
            raise serializers.ValidationError(
                "This status is set by the system only and cannot be assigned directly."
            )
        # On Hold is reached only through the hold/unhold endpoints (Phase 5),
        # which record the hold and cascade to the lead's open tasks (§5.8).
        # A plain status write here would skip that, so it is rejected.
        if value == Lead.Status.ON_HOLD:
            raise serializers.ValidationError(
                "Use the hold endpoint to put a lead on hold."
            )
        # Dropped likewise goes through the drop endpoint (Phase 14d, Tech Req
        # §4.3.2 v16) so the drop remark is captured and open/held tasks are
        # moved to `dropped`.
        if value == Lead.Status.DROPPED:
            raise serializers.ValidationError(
                "Use the drop endpoint to drop a lead."
            )
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        roles = user_role_names(user)
        is_create = self.instance is None

        # Flow of tasks / Type of Project (§4.3 v17). Type of Project is a
        # required label on every lead. Flow of tasks decides which stages run
        # for BD/Mining leads and is ignored for Extension (which enters at
        # Task 22) — required for the former, cleared for the latter.
        effective_type = attrs.get(
            "lead_type", getattr(self.instance, "lead_type", Lead.LeadType.BD)
        )
        if is_create and not attrs.get("type_of_project"):
            raise serializers.ValidationError(
                {"type_of_project": "Type of Project is required."}
            )
        if effective_type == Lead.LeadType.EXTENSION:
            attrs["flow_of_tasks"] = ""  # not applicable to Extension leads
        elif is_create and not attrs.get("flow_of_tasks"):
            raise serializers.ValidationError(
                {"flow_of_tasks": "Flow of tasks is required for BD and Mining leads."}
            )

        if is_create:
            attrs["status"] = Lead.Status.IN_PROGRESS  # always system-default
            if LEAD_MANAGER in roles:
                # Lead Manager creates with an owner (workflow starts on save).
                if not attrs.get("assigned_to"):
                    raise serializers.ValidationError(
                        {"assigned_to": "An owner is required when a Lead Manager creates a lead."}
                    )
            elif MARKETING in roles:
                # Marketing has no control over the owner — force "Not Assigned".
                attrs["assigned_to"] = None
        else:
            # Marketing (and not also LM/LA) may never change the owner.
            if MARKETING in roles and not (roles & {LEAD_MANAGER, LEAD_ADMIN}):
                if "assigned_to" in attrs and attrs["assigned_to"] != self.instance.assigned_to:
                    raise serializers.ValidationError(
                        {"assigned_to": "Marketing cannot assign or change the lead owner."}
                    )
        return attrs


class ChecklistSerializer(serializers.ModelSerializer):
    """A checklist item — only ``status`` and ``remark`` are user-editable.

    Saved independently of task closure (Tech Req §4.5); the view stamps
    ``last_edited_at``/``last_edited_by`` on each write.
    """

    last_edited_by_name = serializers.CharField(
        source="last_edited_by.name", read_only=True, default=None
    )

    class Meta:
        model = Checklist
        fields = [
            "id",
            "task",
            "item_key",
            "item_label",
            "status",
            "remark",
            "last_edited_at",
            "last_edited_by",
            "last_edited_by_name",
        ]
        read_only_fields = [
            "id",
            "task",
            "item_key",
            "item_label",
            "last_edited_at",
            "last_edited_by",
        ]


class HoldIntervalSerializer(serializers.ModelSerializer):
    """One hold→unhold interval of a task's hold trail (Phase 13).

    Read-only: the reason + who/when for each pause, so a Lead Manager can review
    the full trail of a task that was held and resumed several times.
    """

    hold_by_name = serializers.CharField(source="hold_by.name", read_only=True, default=None)
    unhold_by_name = serializers.CharField(source="unhold_by.name", read_only=True, default=None)

    class Meta:
        model = TaskHold
        fields = [
            "id",
            "reason",
            "hold_at",
            "hold_by",
            "hold_by_name",
            "unhold_at",
            "unhold_by",
            "unhold_by_name",
            "unhold_reason",
        ]
        read_only_fields = fields


class TaskSerializer(serializers.ModelSerializer):
    """A workflow task instance with its checklist and dynamic-field schema.

    ``extra_fields`` holds the submitted values (writable on a Save-as-Draft
    PATCH); ``field_schema`` is the read-only per-step field definition pulled
    from the active workflow so the frontend can render the form. Every write
    runs the global field validators (§3); mandatory-field enforcement happens
    only at Save-&-Complete (see the ``complete`` action).
    """

    assigned_to_name = serializers.CharField(
        source="assigned_to.name", read_only=True, default=None
    )
    # The stage this task belongs to (R3) — its code drives the stage-grouped
    # stepper and the Project-ID suffix (§4.4/§13). None for a not-yet-opened
    # (pending) trigger task, whose stage opens only when it does.
    stage_code = serializers.CharField(source="stage.stage", read_only=True, default=None)
    # Lead labels so cross-lead views (e.g. the Held Tasks menu) can show which
    # lead each task belongs to without a second fetch.
    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    checklist_items = ChecklistSerializer(many=True, read_only=True)
    # The task's hold trail (most-recent first) — reason + who/when per interval.
    holds = HoldIntervalSerializer(many=True, read_only=True)
    field_schema = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_hold = serializers.SerializerMethodField()
    can_reassign = serializers.SerializerMethodField()
    # For a trigger-`pending` task: when it will open and how many days out, so
    # the frontend can show the offset instead of an unexplained pending state.
    scheduled_open = serializers.SerializerMethodField()
    # R5: the append-only slot picture for an allocation task (3/10/17/18/24/25)
    # — which slots it manages, how many of each are required, who currently
    # occupies each, and cross-cycle prefill suggestions. None for a non-
    # allocation task.
    allocation = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "lead",
            "task_no",
            "task_name",
            "stage_code",
            "assigned_to",
            "assigned_to_name",
            "lead_company_name",
            "lead_project_name",
            "status",
            "is_allocation_task",
            "is_finance_gate",
            "is_hanging_task",
            "reopened_count",
            "extra_fields",
            "field_schema",
            "checklist_items",
            "holds",
            "can_edit",
            "can_hold",
            "can_reassign",
            "scheduled_open",
            "allocation",
            "short_closed",
            "project_id",
            "task_start_dt",
            "task_end_dt",
            "elapsed_time",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "lead",
            "task_no",
            "task_name",
            "assigned_to",
            "status",
            "is_allocation_task",
            "is_finance_gate",
            "is_hanging_task",
            "reopened_count",
            "short_closed",
            "project_id",
            "task_start_dt",
            "task_end_dt",
            "elapsed_time",
            "created_at",
            "updated_at",
        ]

    def _task_def(self, obj):
        """This task's definition from the (context-cached) active workflow."""
        defs = self.context.get("task_defs")
        if defs is None:
            return None
        return defs.get(obj.task_no)

    def get_field_schema(self, obj):
        tdef = self._task_def(obj)
        return (tdef or {}).get("extra_fields", [])

    def get_can_edit(self, obj):
        request = self.context.get("request")
        if not request:
            return False
        return can_edit_task(request.user, obj)

    def get_can_hold(self, obj):
        request = self.context.get("request")
        if not request:
            return False
        return can_hold_task(request.user, obj)

    def get_can_reassign(self, obj):
        request = self.context.get("request")
        if not request:
            return False
        return can_reassign_task(request.user, obj)

    def get_scheduled_open(self, obj):
        info = engine.pending_open_info(obj)
        if not info:
            return None
        open_date = info["open_date"]
        days = (open_date - timezone.now().date()).days
        return {
            "open_date": open_date.isoformat(),
            "days_from_now": days,
            "offset_days": info["offset_days"],
            "reference_task_no": info["reference_task_no"],
        }

    def get_allocation(self, obj):
        tdef = self._task_def(obj)
        ctx = resources.allocation_context(obj, tdef)
        if ctx is None:
            return None
        prefill_users = User.objects.in_bulk(list(ctx["prefill"].values()))
        return {
            "slots": ctx["slots"],
            "slot_labels": {s: ResourceAllocation.Slot(s).label for s in ctx["slots"]},
            "single_occupancy_slots": [
                s for s in ctx["slots"] if s in ResourceAllocation.SINGLE_OCCUPANCY_SLOTS
            ],
            "required": ctx["required"],
            "occupants": {
                slot: ResourceAllocationSerializer(rows, many=True, context=self.context).data
                for slot, rows in ctx["occupants"].items()
            },
            "prefill": {
                slot: _user_label(prefill_users.get(uid))
                for slot, uid in ctx["prefill"].items()
            },
        }

    def validate_extra_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object of field values.")
        tdef = self._task_def(self.instance) if self.instance else None
        if tdef is not None:
            # Draft save: global numeric rules + date well-formedness only
            # (past dates are allowed on task date fields, 2026-07-20 per the
            # user), no mandatory-field enforcement.
            engine.validate_extra_fields(tdef, value, require_mandatory=False)
        return value


def _user_label(user):
    return {"id": user.id, "name": user.name, "username": user.username} if user else None


class ResourceAllocationSerializer(serializers.ModelSerializer):
    """One append-only resource_allocation row (Tech Req §4.7 / PRD §5.7 — R5).

    Read-only/history-oriented — a row is never edited in place; slot actions
    (allocate/reassign/release/submit, all on the parent allocation task) are
    what create and release rows. Carries the lead + stage context so the
    Resource-Manager reporting screen and the resource-history dashboard don't
    need a second fetch.
    """

    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    lead_project_id = serializers.SerializerMethodField()
    lead_manager = serializers.SerializerMethodField()
    stage_code = serializers.CharField(source="stage.stage", read_only=True, default=None)
    task_no = serializers.IntegerField(source="task.task_no", read_only=True, default=None)
    slot_label = serializers.CharField(source="get_slot_display", read_only=True)
    user_name = serializers.SerializerMethodField()
    # Resource-history dashboard support (§4.7/§9.1): days worked so far (open-
    # ended rows use "now"), and the id of whatever row replaced this one (if
    # any) so the frontend can walk a reassignment chain without extra fetches.
    days_worked = serializers.SerializerMethodField()
    replaced_by_id = serializers.SerializerMethodField()

    class Meta:
        model = ResourceAllocation
        fields = [
            "id",
            "lead",
            "lead_company_name",
            "lead_project_name",
            "lead_project_id",
            "lead_manager",
            "stage",
            "stage_code",
            "task",
            "task_no",
            "slot",
            "slot_label",
            "names",
            "user",
            "user_name",
            "is_tbd",
            "status",
            "allocated_on",
            "released_on",
            "replaces",
            "replaced_by_id",
            "days_worked",
            "man_power_required",
            "remark",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_lead_project_id(self, obj):
        return projects.derived_project_id(obj.lead)

    def get_lead_manager(self, obj):
        return _user_label(obj.lead.assigned_to)

    def get_user_name(self, obj):
        return _user_label(obj.user)

    def get_days_worked(self, obj):
        end = obj.released_on or timezone.now()
        return round((end - obj.allocated_on).total_seconds() / 86400, 1)

    def get_replaced_by_id(self, obj):
        row = obj.replaced_by.order_by("id").first()
        return row.id if row else None


class ProjectDetailsSerializer(serializers.ModelSerializer):
    """One project cycle for the Project Closure screen (Tech Req §4.8, §9.2 —
    R6 rebuild).

    One row per completed Implementation (``IM``) or Extension-loop (``E{n}``)
    cycle, listed across a project's whole ``base_code`` family (parent lead +
    any Mining children share one ``base_code``, §13) so implementation, every
    extension, and any mining cycle show up together without a special case —
    see ``views.ProjectClosureListView``. ``status`` is **derived** from the
    linked stage's own lifecycle (``in_progress``/``closed``/``skipped``)
    rather than duplicated on this row (Tech Req §4.8's field list is exactly
    the six model fields). ``execution_red``/``execution_brown``/``whites`` are
    derived live from ``ResourceAllocation.objects.filter(stage=...)`` now that
    this row carries ``stage_id`` (the R5 note this class used to carry — the
    old direct FK pointed at a wide-table shape that no longer exists).
    """

    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    lead_base_code = serializers.CharField(source="lead.base_code", read_only=True)
    lead_type = serializers.CharField(source="lead.lead_type", read_only=True)
    stage_code = serializers.CharField(source="stage.stage", read_only=True, default=None)
    lead_manager = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    execution_red = serializers.SerializerMethodField()
    execution_brown = serializers.SerializerMethodField()
    whites = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDetails
        fields = [
            "id",
            "lead",
            "lead_company_name",
            "lead_project_name",
            "lead_base_code",
            "lead_type",
            "lead_manager",
            "stage",
            "stage_code",
            "project",
            "status",
            "project_id",
            "execution_red",
            "execution_brown",
            "whites",
            "fixed_fee",
            "variable_fee",
            "generated_at",
        ]

    def get_lead_manager(self, obj):
        return _user_label(obj.lead.assigned_to)

    # Derived from the linked stage's own status — no separate column (§4.8).
    _STAGE_STATUS_LABELS = {
        LeadStage.Status.IN_PROGRESS: "In Progress",
        LeadStage.Status.CLOSED: "Complete",
        LeadStage.Status.SKIPPED: "Skipped",
    }

    def get_status(self, obj):
        if obj.stage is None:
            return None
        return self._STAGE_STATUS_LABELS.get(obj.stage.status, obj.stage.status)

    def _stage_occupants(self, obj, slot):
        if obj.stage_id is None:
            return []
        return list(
            ResourceAllocation.objects.filter(stage_id=obj.stage_id, slot=slot)
            .select_related("user")
            .order_by("id")
        )

    def get_execution_red(self, obj):
        rows = self._stage_occupants(obj, ResourceAllocation.Slot.EXECUTION_RED)
        return _user_label(rows[-1].user) if rows and rows[-1].user_id else None

    def get_execution_brown(self, obj):
        rows = self._stage_occupants(obj, ResourceAllocation.Slot.EXECUTION_BROWN)
        return _user_label(rows[-1].user) if rows and rows[-1].user_id else None

    def get_whites(self, obj):
        rows = [
            r for r in self._stage_occupants(obj, ResourceAllocation.Slot.WHITE)
            if r.status == ResourceAllocation.Status.ALLOCATED and r.user_id
        ]
        return [_user_label(r.user) for r in rows]


class FollowupUpdateSerializer(serializers.ModelSerializer):
    """One comment in a follow-up's progress thread (write = ``comment`` only)."""

    author_name = serializers.CharField(source="author.name", read_only=True)

    class Meta:
        model = FollowupUpdate
        fields = ["id", "followup", "author", "author_name", "comment", "created_at"]
        read_only_fields = ["id", "followup", "author", "created_at"]


class FollowupSerializer(serializers.ModelSerializer):
    """A follow-up raised against a lead (Tech Req §4.10 / PRD §5.11).

    Writable on create: ``lead``, ``title``, ``assigned_to``, ``followup_date``,
    ``remark``. ``status`` is writable (open → done) on update; ``created_by`` is
    system-set. ``followup_date`` may not be a past date (§3). Read responses
    carry the lead/user labels and the full comment thread for the dialog.
    """

    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=exclude_user_management(User.objects.filter(is_active=True)),
    )
    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    updates = FollowupUpdateSerializer(many=True, read_only=True)

    class Meta:
        model = Followup
        fields = [
            "id",
            "lead",
            "lead_company_name",
            "lead_project_name",
            "title",
            "assigned_to",
            "assigned_to_name",
            "created_by",
            "created_by_name",
            "followup_date",
            "remark",
            "status",
            "updates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_followup_date(self, value):
        # Global no-past-dates rule (§3). Only runs when the field is supplied,
        # so a mark-done PATCH (which omits it) never trips on an elapsed date.
        if value < timezone.now().date():
            raise serializers.ValidationError("Past dates are not allowed.")
        return value

    def validate(self, attrs):
        if self.instance is None:
            attrs["status"] = Followup.Status.OPEN  # always open on create
        return attrs


# Upload cap for the Files tab (PRD §5.14 / Phase-8 scope): 5 MB.
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024


class AttachmentSerializer(serializers.ModelSerializer):
    """A lead attachment (Decision #4). ``file`` is write-only on upload; reads
    return an absolute ``url`` the Files tab links to for view/download.
    """

    url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.name", read_only=True, default=None
    )

    class Meta:
        model = Attachment
        fields = [
            "id",
            "lead",
            "file",
            "url",
            "filename",
            "title",
            "uploaded_by",
            "uploaded_by_name",
            "uploaded_at",
        ]
        read_only_fields = ["id", "lead", "filename", "uploaded_by", "uploaded_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def validate_file(self, value):
        if value.size > MAX_ATTACHMENT_BYTES:
            raise serializers.ValidationError("File is too large (max 5 MB).")
        return value


class ActivityLogSerializer(serializers.ModelSerializer):
    """A read-only lead activity entry for the Lead Detail "Activity" tab."""

    actor_name = serializers.CharField(source="actor.name", read_only=True, default=None)

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "lead",
            "actor",
            "actor_name",
            "type",
            "summary",
            "body",
            "created_at",
        ]
        read_only_fields = fields


class NotificationSerializer(serializers.ModelSerializer):
    """An in-app notification. ``read`` mirrors ``is_read`` so the frontend's
    existing bell/notifications page reads unchanged; only ``read`` is writable
    (mark-read is also exposed as a dedicated action).
    """

    read = serializers.BooleanField(source="is_read", required=False)

    class Meta:
        model = Notification
        fields = ["id", "type", "message", "link", "read", "created_at"]
        read_only_fields = ["id", "type", "message", "link", "created_at"]
