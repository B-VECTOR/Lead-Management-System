from django.urls import path

from .views import (
    AllocationAllocateView,
    AllocationReassignView,
    AllocationReleaseView,
    AllocationSubmitView,
    AllocationTaskListView,
    AllocationUserListView,
    AssignableUserListView,
    AttachmentDeleteView,
    ChecklistItemUpdateView,
    DashboardView,
    FinanceGateListView,
    FollowupAssigneeListView,
    FollowupDetailView,
    FollowupListCreateView,
    FollowupUpdateListCreateView,
    HeldLeadListView,
    HeldTaskListView,
    LeadActivityListView,
    LeadAttachmentListCreateView,
    LeadDetailView,
    LeadDropView,
    LeadHoldView,
    LeadListCreateView,
    LeadResourceAllocationListView,
    LeadShortCloseView,
    LeadTaskListView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    ProjectClosureListView,
    ResourceAllocationListView,
    TaskCompleteView,
    TaskDetailView,
    TaskHoldView,
    TaskReassignView,
)

app_name = "leads"

urlpatterns = [
    path("api/leads/", LeadListCreateView.as_view(), name="api-lead-list"),
    path("api/leads/<int:pk>/", LeadDetailView.as_view(), name="api-lead-detail"),
    path(
        "api/assignable-users/",
        AssignableUserListView.as_view(),
        name="api-assignable-users",
    ),
    # Hold / unhold (Phase 5 — Tech Req §4.9, §6; PRD §5.8)
    path("api/held-leads/", HeldLeadListView.as_view(), name="api-held-leads"),
    path("api/held-tasks/", HeldTaskListView.as_view(), name="api-held-tasks"),
    path(
        "api/leads/<int:pk>/hold/",
        LeadHoldView.as_view(action="hold"),
        name="api-lead-hold",
    ),
    path(
        "api/leads/<int:pk>/unhold/",
        LeadHoldView.as_view(action="unhold"),
        name="api-lead-unhold",
    ),
    # Drop (Phase 14d — Tech Req §4.3.2 v16: popup + remark + task cascade)
    path(
        "api/leads/<int:pk>/drop/",
        LeadDropView.as_view(),
        name="api-lead-drop",
    ),
    # Short-close (R6, §9.2/§5.12) — lead-scoped, RM-only.
    path(
        "api/leads/<int:pk>/short-close/",
        LeadShortCloseView.as_view(),
        name="api-lead-short-close",
    ),
    path(
        "api/tasks/<int:pk>/hold/",
        TaskHoldView.as_view(action="hold"),
        name="api-task-hold",
    ),
    path(
        "api/tasks/<int:pk>/unhold/",
        TaskHoldView.as_view(action="unhold"),
        name="api-task-unhold",
    ),
    # Tasks & checklists (Phase 4 — workflow engine)
    path(
        "api/leads/<int:lead_id>/tasks/",
        LeadTaskListView.as_view(),
        name="api-lead-tasks",
    ),
    path("api/tasks/<int:pk>/", TaskDetailView.as_view(), name="api-task-detail"),
    path(
        "api/tasks/<int:pk>/complete/",
        TaskCompleteView.as_view(),
        name="api-task-complete",
    ),
    path(
        "api/tasks/<int:pk>/reassign/",
        TaskReassignView.as_view(),
        name="api-task-reassign",
    ),
    path(
        "api/checklist-items/<int:pk>/",
        ChecklistItemUpdateView.as_view(),
        name="api-checklist-item",
    ),
    # Resource allocation + Project closure (R5 rebuild — Tech Req §4.7–4.8, §7, §9)
    path(
        "api/leads/<int:lead_id>/resource-allocations/",
        LeadResourceAllocationListView.as_view(),
        name="api-lead-resource-allocations",
    ),
    path(
        "api/resource-allocations/",
        ResourceAllocationListView.as_view(),
        name="api-resource-allocations",
    ),
    path(
        "api/allocation-tasks/",
        AllocationTaskListView.as_view(),
        name="api-allocation-tasks",
    ),
    path(
        "api/allocation-tasks/<int:task_id>/allocate/",
        AllocationAllocateView.as_view(),
        name="api-allocation-task-allocate",
    ),
    path(
        "api/allocation-tasks/<int:task_id>/reassign/",
        AllocationReassignView.as_view(),
        name="api-allocation-task-reassign",
    ),
    path(
        "api/allocation-tasks/<int:task_id>/release/",
        AllocationReleaseView.as_view(),
        name="api-allocation-task-release",
    ),
    path(
        "api/allocation-tasks/<int:task_id>/submit/",
        AllocationSubmitView.as_view(),
        name="api-allocation-task-submit",
    ),
    path(
        "api/allocation-users/",
        AllocationUserListView.as_view(),
        name="api-allocation-users",
    ),
    path(
        "api/project-closure/",
        ProjectClosureListView.as_view(),
        name="api-project-closure",
    ),
    # Follow-ups & Other Tasks (Phase 7 — Tech Req §4.10, §8; PRD §5.11)
    path(
        "api/followups/",
        FollowupListCreateView.as_view(),
        name="api-followups",
    ),
    path(
        "api/followups/<int:pk>/",
        FollowupDetailView.as_view(),
        name="api-followup-detail",
    ),
    path(
        "api/followups/<int:followup_id>/updates/",
        FollowupUpdateListCreateView.as_view(),
        name="api-followup-updates",
    ),
    path(
        "api/followup-assignees/",
        FollowupAssigneeListView.as_view(),
        name="api-followup-assignees",
    ),
    # Activity log + Attachments (Phase 8 — PRD §6 / Decision #4)
    path(
        "api/leads/<int:lead_id>/activities/",
        LeadActivityListView.as_view(),
        name="api-lead-activities",
    ),
    path(
        "api/leads/<int:lead_id>/attachments/",
        LeadAttachmentListCreateView.as_view(),
        name="api-lead-attachments",
    ),
    path(
        "api/attachments/<int:pk>/",
        AttachmentDeleteView.as_view(),
        name="api-attachment-detail",
    ),
    # Notifications (Phase 8 — Decision #4)
    path(
        "api/notifications/",
        NotificationListView.as_view(),
        name="api-notifications",
    ),
    path(
        "api/notifications/mark-all-read/",
        NotificationMarkAllReadView.as_view(),
        name="api-notifications-mark-all-read",
    ),
    path(
        "api/notifications/<int:pk>/read/",
        NotificationMarkReadView.as_view(),
        name="api-notification-read",
    ),
    # Leads-funnel dashboard (Phase 8 — PRD §6)
    path("api/dashboard/", DashboardView.as_view(), name="api-dashboard"),
    # Finance Accounts queue — payment-approval gate tasks 7/15/28 (R4, §5.10)
    path("api/finance-gates/", FinanceGateListView.as_view(), name="api-finance-gates"),
]
