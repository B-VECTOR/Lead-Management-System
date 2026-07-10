from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from . import engine
from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    FollowupUpdate,
    Lead,
    Notification,
    ProjectDetails,
    ResourceAllocation,
    Task,
)
from .permissions import (
    LEAD_ADMIN,
    LEAD_MANAGER,
    MARKETING,
    can_edit_task,
    can_hold_task,
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
    render country/industry/domain/owner without a second lookup. Writes still
    use the FK ids. ``created_by`` and the Project-ID fields are system-managed
    (read-only); ``status`` is writable but may not be set to a system-only
    value (Tech Req §4.3.2).
    """

    # Only active, non-deleted users may own a lead. ("BD users" is not further
    # defined in the docs; not over-restricted here — see PLAN Phase-3 note.)
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    country_name = serializers.CharField(source="country.name", read_only=True)
    industry_name = serializers.CharField(source="industry.name", read_only=True)
    domain_name = serializers.CharField(source="domain.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id",
            "country",
            "country_name",
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
            "status",
            "project_id",
            "project_id_base",
            "extension",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project_id",
            "project_id_base",
            "extension",
            "created_by",
            "created_at",
            "updated_at",
        ]

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
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        roles = user_role_names(user)
        is_create = self.instance is None

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
    # Lead labels so cross-lead views (e.g. the Held Tasks menu) can show which
    # lead each task belongs to without a second fetch.
    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    checklist_items = ChecklistSerializer(many=True, read_only=True)
    field_schema = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_hold = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "lead",
            "task_no",
            "task_name",
            "assigned_to",
            "assigned_to_name",
            "lead_company_name",
            "lead_project_name",
            "status",
            "is_allocation_task",
            "extra_fields",
            "field_schema",
            "checklist_items",
            "can_edit",
            "can_hold",
            "opened_at",
            "closed_at",
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
            "opened_at",
            "closed_at",
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

    def validate_extra_fields(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object of field values.")
        tdef = self._task_def(self.instance) if self.instance else None
        if tdef is not None:
            # Draft save: global rules only, no mandatory-field enforcement.
            engine.validate_extra_fields(tdef, value, require_mandatory=False)
        return value


def _user_label(user):
    return {"id": user.id, "name": user.name, "username": user.username} if user else None


def _latest_field(lead, task_no, key):
    """Latest captured value of ``key`` on a lead's most-recent task ``task_no``."""
    task = (
        lead.tasks.filter(task_no=task_no)
        .exclude(extra_fields={})
        .order_by("-id")
        .first()
    )
    if task is None:
        return None
    return (task.extra_fields or {}).get(key)


class ResourceAllocationSerializer(serializers.ModelSerializer):
    """A resource_allocation row — the Resource Manager's allocation form + list
    entry (Tech Req §4.7 / PRD §5.7).

    The 12 resource FKs and ``remark`` are writable; ``type``/``status``/
    ``man_power_required`` are system-managed. Read responses carry the lead
    context (company/project, owner, upstream man-power) for the accordion, the
    resolved resource names, and the ``is_over_allocated`` exceeded flag.
    """

    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    lead_manager = serializers.SerializerMethodField()
    resource_names = serializers.SerializerMethodField()
    allocated_count = serializers.IntegerField(read_only=True)
    is_over_allocated = serializers.BooleanField(read_only=True)

    class Meta:
        model = ResourceAllocation
        fields = [
            "id",
            "lead",
            "lead_company_name",
            "lead_project_name",
            "lead_manager",
            "allocation_task",
            "type",
            "status",
            "man_power_required",
            "allocated_count",
            "is_over_allocated",
            "remark",
            "resource_names",
            "created_at",
            "closed_at",
            *ResourceAllocation.RESOURCE_FIELDS,
        ]
        read_only_fields = [
            "id",
            "lead",
            "allocation_task",
            "type",
            "status",
            "man_power_required",
            "created_at",
            "closed_at",
        ]

    def get_lead_manager(self, obj):
        return _user_label(obj.lead.assigned_to)

    def get_resource_names(self, obj):
        return {
            f: _user_label(getattr(obj, f)) for f in ResourceAllocation.RESOURCE_FIELDS
        }


class ProjectDetailsSerializer(serializers.ModelSerializer):
    """One project cycle for the Project Closure screen (Tech Req §4.8, §9.2).

    Lists one row per implementation/extension cycle with its own Project ID,
    extension number, and status, plus the resource + fee context pulled from
    the linked allocation and the workflow. ``can_short_close`` is true only on
    the current cycle of a not-yet-complete lead.
    """

    lead_company_name = serializers.CharField(source="lead.company_name", read_only=True)
    lead_project_name = serializers.CharField(source="lead.project_name", read_only=True)
    lead_manager = serializers.SerializerMethodField()
    execution_red = serializers.SerializerMethodField()
    execution_brown = serializers.SerializerMethodField()
    white = serializers.SerializerMethodField()
    fixed_fee = serializers.SerializerMethodField()
    variable_fee = serializers.SerializerMethodField()
    fixed_fee_upto = serializers.SerializerMethodField()
    can_short_close = serializers.SerializerMethodField()

    class Meta:
        model = ProjectDetails
        fields = [
            "id",
            "lead",
            "lead_company_name",
            "lead_project_name",
            "lead_manager",
            "resource_allocation",
            "extension_no",
            "project_id",
            "project_id_base",
            "status",
            "is_current",
            "execution_red",
            "execution_brown",
            "white",
            "fixed_fee",
            "variable_fee",
            "fixed_fee_upto",
            "can_short_close",
            "generated_at",
        ]

    def get_lead_manager(self, obj):
        return _user_label(obj.lead.assigned_to)

    def _alloc_user(self, obj, field):
        alloc = obj.resource_allocation
        return _user_label(getattr(alloc, field)) if alloc else None

    def get_execution_red(self, obj):
        return self._alloc_user(obj, "execution_red")

    def get_execution_brown(self, obj):
        return self._alloc_user(obj, "execution_brown")

    def get_white(self, obj):
        return self._alloc_user(obj, "white")

    # Fee context — "latest captured value from the workflow" (§9.2). Fixed fee
    # is summed from Task 10/14's fixed_fee_blocks; variable fee is Task 10's
    # total cap. "Fixed Fee Upto" has no dedicated workflow field, so it is
    # surfaced as null (documented — see PLAN Phase-6 interpretation note).
    def get_fixed_fee(self, obj):
        for task_no in (14, 10):
            blocks = _latest_field(obj.lead, task_no, "fixed_fee_blocks")
            if blocks:
                total = 0
                for row in blocks:
                    try:
                        total += float(row.get("fee") or 0)
                    except (TypeError, ValueError):
                        continue
                return total
        return None

    def get_variable_fee(self, obj):
        return _latest_field(obj.lead, 10, "variable_fee_cap_total")

    def get_fixed_fee_upto(self, obj):
        return None

    def get_can_short_close(self, obj):
        return obj.is_current and obj.lead.status != Lead.Status.COMPLETE


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
        queryset=User.objects.filter(is_active=True),
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
