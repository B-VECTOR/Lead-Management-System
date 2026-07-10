from django.contrib import admin

from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    FollowupUpdate,
    Lead,
    LeadHold,
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
        "company_name",
        "project_name",
        "lead_type",
        "status",
        "assigned_to",
        "created_by",
        "created_at",
    )
    list_filter = ("lead_type", "status", "country", "industry", "domain")
    search_fields = ("company_name", "project_name", "division")
    autocomplete_fields = ("country", "industry", "domain")
    raw_id_fields = ("assigned_to", "created_by")
    readonly_fields = ("project_id", "project_id_base", "extension", "created_at", "updated_at")


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
        "status",
        "assigned_to",
        "is_allocation_task",
        "opened_at",
        "closed_at",
    )
    list_filter = ("status", "is_allocation_task", "task_no")
    search_fields = ("task_name", "lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "assigned_to")
    readonly_fields = ("opened_at", "closed_at", "elapsed_time", "created_at", "updated_at")
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
        "is_active",
    )
    list_filter = ("is_active", "workflow", "task_no")
    list_editable = ("offset_days", "is_active")
    search_fields = ("reference_field_key",)
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
        "id", "lead", "type", "status", "man_power_required",
        "allocated_count", "is_over_allocated", "created_at", "closed_at",
    )
    list_filter = ("type", "status")
    search_fields = ("lead__company_name", "lead__project_name")
    raw_id_fields = ("lead", "allocation_task", *ResourceAllocation.RESOURCE_FIELDS)
    readonly_fields = ("created_at", "closed_at")


@admin.register(ProjectDetails)
class ProjectDetailsAdmin(admin.ModelAdmin):
    list_display = (
        "id", "lead", "project_id", "extension_no", "status",
        "is_current", "generated_at", "generated_by",
    )
    list_filter = ("status", "is_current")
    search_fields = ("project_id", "project_id_base", "lead__company_name")
    raw_id_fields = ("lead", "resource_allocation", "generated_by")
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
