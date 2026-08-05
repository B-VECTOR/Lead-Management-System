from django.contrib import admin

from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    FollowupUpdate,
    Lead,
    LeadComment,
    LeadHold,
    LeadStage,
    Notification,
    ProjectDetails,
    ResourceAllocation,
    Task,
    TaskHold,
    Workflow,
    WorkflowTriggerConfig,
)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "base_code",
        "company_name",
        "project_name",
        "lead_type",
        "flow_of_tasks",
        "type_of_project",
        "status",
        "assigned_to",
        "created_by",
        "created_at",
    )
    list_filter = (
        "lead_type", "flow_of_tasks", "type_of_project", "status",
        "country", "industry", "domain",
    )
    search_fields = ("base_code", "project_id", "company_name", "project_name", "division")
    autocomplete_fields = ("country", "industry", "domain")
    raw_id_fields = ("assigned_to", "created_by", "parent_lead", "short_closed_by")
    readonly_fields = (
        "base_code", "project_id", "project_id_base", "extension",
        "short_closed_at", "created_at", "updated_at",
    )


@admin.register(LeadStage)
class LeadStageAdmin(admin.ModelAdmin):
    """The stage history driving the derived Project ID suffix (Tech Req §4.4)."""

    list_display = ("id", "lead", "stage", "project_id", "status", "stage_start_dt", "stage_end_dt")
    list_filter = ("stage", "status")
    search_fields = ("lead__company_name", "lead__project_name", "lead__base_code", "project_id")
    raw_id_fields = ("lead",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Workflow)
class WorkflowAdmin(admin.ModelAdmin):
    """Edit the task-graph JSON directly (Tech Req §4.11 / PRD §5.16)."""

    list_display = ("id", "name", "type", "status", "updated_at")
    list_filter = ("type", "status")
    search_fields = ("name",)
    readonly_fields = ("created_at", "updated_at")


class ChecklistInline(admin.TabularInline):
    model = Checklist
    extra = 0
    fields = ("item_key", "item_label", "status", "remark", "last_edited_by", "last_edited_at")
    readonly_fields = ("item_key", "item_label", "last_edited_by", "last_edited_at")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "lead",
        "task_no",
        "task_name",
        "stage",
        "status",
        "assigned_to",
        "is_allocation_task",
        "is_finance_gate",
        "is_hanging_task",
        "reopened_count",
        "short_closed",
        "project_id",
        "task_start_dt",
        "task_end_dt",
    )
    list_filter = ("status", "is_allocation_task", "is_finance_gate", "is_hanging_task", "short_closed", "task_no")
    search_fields = ("task_name", "lead__company_name", "lead__project_name", "project_id")
    raw_id_fields = ("lead", "stage", "assigned_to")
    readonly_fields = ("task_start_dt", "task_end_dt", "elapsed_time", "created_at", "updated_at")
    inlines = [ChecklistInline]


@admin.register(WorkflowTriggerConfig)
class WorkflowTriggerConfigAdmin(admin.ModelAdmin):
    """Admin-editable date-offset trigger rules (Tech Req §4.12 / PRD §5.6)."""

    list_display = (
        "id",
        "workflow",
        "task_no",
        "reference_task_no",
        "reference_field_key",
        "offset_days",
        "condition_field_key",
        "condition_max",
        "is_active",
    )
    list_filter = ("is_active", "workflow", "task_no")
    list_editable = ("offset_days", "is_active")
    search_fields = ("reference_field_key", "condition_field_key")
    readonly_fields = ("created_at", "updated_at")


@admin.register(LeadHold)
class LeadHoldAdmin(admin.ModelAdmin):
    list_display = ("id", "lead", "hold_at", "hold_by", "unhold_at", "unhold_by")
    list_filter = ("hold_at", "unhold_at")
    raw_id_fields = ("lead", "hold_by", "unhold_by")


@admin.register(TaskHold)
class TaskHoldAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "hold_at", "hold_by", "unhold_at", "unhold_by")
    list_filter = ("hold_at", "unhold_at")
    raw_id_fields = ("task", "hold_by", "unhold_by")


@admin.register(ResourceAllocation)
class ResourceAllocationAdmin(admin.ModelAdmin):
    list_display = (
        "id", "lead", "stage", "slot", "user", "is_tbd", "status",
        "man_power_required", "allocated_on", "released_on",
    )
    list_filter = ("slot", "status", "is_tbd")
    search_fields = ("lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "stage", "task", "user", "replaces")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProjectDetails)
class ProjectDetailsAdmin(admin.ModelAdmin):
    list_display = (
        "id", "lead", "stage", "project_id",
        "fixed_fee", "variable_fee", "generated_at", "generated_by",
    )
    list_filter = ("stage__stage",)
    search_fields = ("project_id", "lead__company_name")
    raw_id_fields = ("lead", "stage", "generated_by")
    readonly_fields = ("generated_at",)


class FollowupUpdateInline(admin.TabularInline):
    model = FollowupUpdate
    extra = 0
    fields = ("author", "comment", "created_at")
    readonly_fields = ("created_at",)
    raw_id_fields = ("author",)


@admin.register(Followup)
class FollowupAdmin(admin.ModelAdmin):
    list_display = (
        "id", "lead", "title", "assigned_to", "created_by",
        "followup_date", "status", "created_at",
    )
    list_filter = ("status", "followup_date")
    search_fields = ("title", "remark", "lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "assigned_to", "created_by")
    readonly_fields = ("created_at", "updated_at")
    inlines = [FollowupUpdateInline]


@admin.register(Checklist)
class ChecklistAdmin(admin.ModelAdmin):
    list_display = ("id", "task", "item_key", "item_label", "status", "last_edited_by")
    list_filter = ("status",)
    search_fields = ("item_key", "item_label")
    raw_id_fields = ("task", "last_edited_by")
    readonly_fields = ("last_edited_at",)


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "lead", "title", "filename", "uploaded_by", "uploaded_at")
    search_fields = ("title", "filename", "lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "uploaded_by")
    readonly_fields = ("uploaded_at",)


@admin.register(LeadComment)
class LeadCommentAdmin(admin.ModelAdmin):
    """Lead Trail entries. Read-only in the admin too (R23-1): the trail is
    append-only in the app, so it shouldn't be quietly rewritable here either."""

    list_display = ("id", "lead", "author", "comment", "created_at")
    list_filter = ("created_at",)
    search_fields = ("comment", "lead__company_name", "lead__project_name", "author__name")
    raw_id_fields = ("lead", "author")
    readonly_fields = ("lead", "project_id", "author", "comment", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("id", "lead", "type", "summary", "actor", "created_at")
    list_filter = ("type", "created_at")
    search_fields = ("summary", "body", "lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "actor")
    readonly_fields = ("created_at",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "type", "message", "is_read", "created_at")
    list_filter = ("type", "is_read", "created_at")
    search_fields = ("message", "user__name", "user__username")
    raw_id_fields = ("user",)
    readonly_fields = ("created_at",)
