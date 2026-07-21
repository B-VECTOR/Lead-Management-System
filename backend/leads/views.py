from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import engine, events, holds, resources
from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    Lead,
    Notification,
    ProjectDetails,
    ResourceAllocation,
    Task,
)
from .permissions import (
    FINANCE,
    LEAD_ADMIN,
    LEAD_MANAGER,
    MARKETING,
    RESOURCE_MANAGER,
    USER_MANAGEMENT,
    CanAddFollowupPermission,
    CanAssignOwnerPermission,
    FollowupPermission,
    LeadPermission,
    ResourceManagerPermission,
    TaskPermission,
    can_edit_followup,
    can_edit_task,
    can_drop_lead,
    can_hold_lead,
    can_hold_task,
    can_reassign_task,
    can_view_followup,
    can_view_task,
    user_role_names,
)
from .serializers import (
    ActivityLogSerializer,
    AssignableUserSerializer,
    AttachmentSerializer,
    ChecklistSerializer,
    FollowupSerializer,
    FollowupUpdateSerializer,
    LeadSerializer,
    NotificationSerializer,
    ProjectDetailsSerializer,
    ResourceAllocationSerializer,
    TaskSerializer,
)

User = get_user_model()

# Groups that are never selectable as a lead/task assignee. Excluding these
# leaves exactly Lead Managers + plain Employees (everyone is implicitly in the
# ``employee`` group), i.e. the "lead & employee people only" rule the user
# asked for on both the lead-owner and resource-allocation people pickers.
NON_ASSIGNABLE_GROUPS = [
    LEAD_ADMIN,
    MARKETING,
    RESOURCE_MANAGER,
    FINANCE,
    USER_MANAGEMENT,
]


def lead_scope_q(user):
    """The lead-visibility ``Q`` for ``user`` — or ``None`` when they see every
    lead (Lead Admin). One home for the PRD §6 / Tech Req §12 rows, extended in
    Phase 12 so task workers and the Resource Manager can open the leads they're
    working:

    - **Lead Admin** — all leads (``None``).
    - **Anyone** — leads they own (``assigned_to``) or are actively working a
      task on (``tasks__assigned_to``). *(The Phase-13 any-allocation-slot rule
      was rescinded per PRD v3 / Tech Req v16 — Phase 14a, 2026-07-16.)*
    - **Lead Manager / Marketing** — additionally the leads they created.
    - **Resource Manager** — additionally any lead with a ``resource_allocation``
      row (it has reached an allocation stage they staff).
    """
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return None
    scope = Q(assigned_to=user) | Q(tasks__assigned_to=user)
    if roles & {LEAD_MANAGER, MARKETING}:
        scope |= Q(created_by=user)
    if RESOURCE_MANAGER in roles:
        scope |= Q(resource_allocations__isnull=False)
    return scope


def user_can_view_lead(user, lead):
    """True if ``user`` may view ``lead`` (a Lead or its pk) — mirrors
    :func:`lead_scope_q`. Gates follow-up creation to a visible lead (Phase 12)."""
    q = lead_scope_q(user)
    lead_id = getattr(lead, "pk", lead)
    base = Lead.objects.filter(pk=lead_id)
    if q is not None:
        base = base.filter(q)
    return base.exists()


class LeadQuerysetMixin:
    """Role-scoped lead queryset shared by the list and detail views — writes
    are still blocked by :class:`LeadPermission`, so the broadened visibility is
    view-only for task workers / the Resource Manager. See :func:`lead_scope_q`.
    """

    def get_queryset(self):
        qs = Lead.objects.select_related(
            "country", "industry", "domain", "assigned_to", "created_by"
        ).prefetch_related("tasks")
        q = lead_scope_q(self.request.user)
        return qs if q is None else qs.filter(q).distinct()


def _notify_owner_assigned(lead, actor):
    """Log the owner assignment and notify the new owner (Phase 8, Decision #4).

    Called both when a Lead Manager creates a lead with an owner and when a Lead
    Admin later assigns one — the same NULL→owner transition that starts the
    workflow (its Task 1 opens via the model signal).
    """
    if lead.assigned_to_id is None:
        return
    events.log_activity(
        lead,
        actor,
        "lead",
        f"Lead assigned to {lead.assigned_to.name}",
    )
    events.notify(
        lead.assigned_to,
        Notification.Type.LEAD_ASSIGNED,
        f"You are now the owner of “{lead.company_name} — {lead.project_name}”.",
        events.lead_link(lead),
    )


def _notify_lead_managers(lead, actor, type, message):
    """Notify the lead's managing people (owner ``assigned_to`` + ``created_by``)
    of a task event, skipping the actor and any duplicate/empty recipient.

    Phase 13 (per the user): the Lead Manager should hear about every task change
    on their lead — a task being held/unheld or completed — even when they are
    not the task's assignee.
    """
    seen = set()
    for manager in (lead.assigned_to, lead.created_by):
        if manager is None or manager.id in seen or manager.id == actor.id:
            continue
        seen.add(manager.id)
        events.notify(manager, type, message, events.lead_link(lead))


class LeadListCreateView(LeadQuerysetMixin, generics.ListCreateAPIView):
    serializer_class = LeadSerializer
    permission_classes = [LeadPermission]

    def perform_create(self, serializer):
        # created_by records whether the lead originated from Marketing or a
        # Lead Manager (Tech Req §4.3); the client can never set it.
        lead = serializer.save(created_by=self.request.user)
        events.log_activity(lead, self.request.user, "lead", "Lead created")
        # A Lead-Manager-created lead already has an owner (workflow started).
        _notify_owner_assigned(lead, self.request.user)


class AssignableUserListView(generics.ListAPIView):
    """Users selectable as a lead's ``assigned_to`` (the BD/LM person actively
    working the lead — not to be confused with the lead's owner/creator,
    ``created_by``, which is never client-settable).

    Per the user, a lead may only be assigned to a **Lead Manager or an
    Employee** — so Lead Admin, Marketing, Resource Manager, Finance and User
    Management are excluded (see :data:`NON_ASSIGNABLE_GROUPS`). Read-only.
    """

    serializer_class = AssignableUserSerializer
    permission_classes = [CanAssignOwnerPermission]
    pagination_class = None

    def get_queryset(self):
        return (
            User.objects.filter(is_active=True, is_superuser=False)
            .exclude(groups__name__in=NON_ASSIGNABLE_GROUPS)
            .order_by("name")
            .distinct()
        )


class LeadDetailView(LeadQuerysetMixin, generics.RetrieveUpdateAPIView):
    """Retrieve / update a single lead.

    No destroy: the §12 matrix defines no delete-lead action — a lead is
    cancelled via ``status = Dropped``, not removed.
    """

    serializer_class = LeadSerializer
    permission_classes = [LeadPermission]

    def perform_update(self, serializer):
        instance = serializer.instance
        had_owner = instance.assigned_to_id is not None
        prev_assigned = instance.assigned_to
        prev_assigned_id = instance.assigned_to_id
        prev_status = instance.status
        # Optional free-text note the actor may attach to a reassignment (not a
        # model field — read straight off the request); recorded on the activity.
        remark = (self.request.data.get("remark") or "").strip()
        lead = serializer.save()
        # Lead Admin assigning an owner to an unassigned lead (starts the flow).
        if not had_owner and lead.assigned_to_id is not None:
            _notify_owner_assigned(lead, self.request.user)
        elif had_owner and lead.assigned_to_id != prev_assigned_id:
            # Reassignment of an already-assigned lead — record who → who (#1).
            prev_name = prev_assigned.name if prev_assigned else "Not Assigned"
            new_name = lead.assigned_to.name if lead.assigned_to_id else "Not Assigned"
            events.log_activity(
                lead,
                self.request.user,
                "lead",
                f"Lead reassigned from {prev_name} to {new_name}",
                remark,
            )
            if lead.assigned_to_id and lead.assigned_to_id != self.request.user.id:
                events.notify(
                    lead.assigned_to,
                    Notification.Type.LEAD_ASSIGNED,
                    f"You are now assigned to “{lead.company_name} — {lead.project_name}”.",
                    events.lead_link(lead),
                )
        elif lead.status != prev_status:
            events.log_activity(
                lead, self.request.user, "lead", f"Status changed to {lead.status}"
            )


# --- Lead / task hold-unhold (Phase 5, Tech Req §4.9, §6; PRD §5.8) ----------

class HeldLeadListView(LeadQuerysetMixin, generics.ListAPIView):
    """Leads currently on hold, role-scoped — the "Held Leads" menu."""

    serializer_class = LeadSerializer
    permission_classes = [LeadPermission]

    def get_queryset(self):
        return super().get_queryset().filter(status=Lead.Status.ON_HOLD)


class LeadHoldView(LeadQuerysetMixin, APIView):
    """Put a lead on hold (cascading to its open tasks) or take it off hold."""

    permission_classes = [LeadPermission]
    action = None  # "hold" | "unhold", set on the URL

    def post(self, request, pk):
        lead = get_object_or_404(self.get_queryset(), pk=pk)
        if not can_hold_lead(request.user, lead):
            return Response(
                {"detail": "You cannot hold or unhold this lead."},
                status=status.HTTP_403_FORBIDDEN,
            )
        remark = (request.data.get("remark") or "").strip()
        if self.action == "hold":
            if holds.hold_lead(lead, request.user, reason=remark) is None:
                return Response(
                    {"detail": "Only an in-progress lead can be put on hold."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if holds.unhold_lead(lead, request.user, reason=remark) is None:
                return Response(
                    {"detail": "This lead is not on hold."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        events.log_activity(
            lead,
            request.user,
            "hold",
            "Lead put on hold" if self.action == "hold" else "Lead resumed",
            remark,
        )
        # Notify the lead's owner when someone else puts it on hold (Employees
        # get the alert in place of the Held Leads tab).
        if self.action == "hold" and lead.assigned_to_id not in (None, request.user.id):
            events.notify(
                lead.assigned_to,
                Notification.Type.LEAD_HELD,
                f"“{lead.company_name} — {lead.project_name}” was put on hold.",
                events.lead_link(lead),
            )
        lead.refresh_from_db()
        return Response(LeadSerializer(lead, context={"request": request}).data)


class LeadDropView(LeadQuerysetMixin, APIView):
    """Drop (cancel) a lead via the drop popup (Tech Req §4.3.2 v16 / PRD §4.2).

    Captures an optional remark (stored as ``leads.drop_remark`` and shown as a
    red banner on the detail page) and moves every open/held task to the
    ``dropped`` status. A plain ``status = Dropped`` PATCH is rejected by the
    serializer so this path cannot be bypassed.
    """

    permission_classes = [LeadPermission]

    def post(self, request, pk):
        lead = get_object_or_404(self.get_queryset(), pk=pk)
        if not can_drop_lead(request.user, lead):
            return Response(
                {"detail": "You cannot drop this lead."},
                status=status.HTTP_403_FORBIDDEN,
            )
        remark = (request.data.get("remark") or "").strip()
        if holds.drop_lead(lead, request.user, remark=remark) is None:
            return Response(
                {"detail": "Only an in-progress or on-hold lead can be dropped."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        events.log_activity(lead, request.user, "status", "Lead dropped", remark)
        lead.refresh_from_db()
        return Response(LeadSerializer(lead, context={"request": request}).data)


# --- Tasks & checklists (Phase 4) ------------------------------------------

class TaskScopeMixin:
    """Role-scoped task queryset matching :func:`can_view_task`."""

    def _scoped_tasks(self, base_qs):
        user = self.request.user
        roles = user_role_names(user)
        qs = base_qs.select_related("lead", "assigned_to").prefetch_related(
            "checklist_items", "holds__hold_by", "holds__unhold_by"
        )
        if LEAD_ADMIN in roles:
            return qs
        conds = Q(assigned_to=user) | Q(lead__assigned_to=user)
        if LEAD_MANAGER in roles:
            conds |= Q(lead__created_by=user)
        return qs.filter(conds).distinct()


class LeadTaskListView(TaskScopeMixin, generics.ListAPIView):
    """All tasks the caller may see under one lead — the stepper's data source.

    ``pending`` (trigger-gated, not yet due) rows are hidden: task lists show
    only steps that have actually opened, plus ``skipped``/``dropped`` ones
    (Tech Req §6 rule 8 v14 — supersedes the Phase-13e pending banner).
    """

    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]
    pagination_class = None

    def get_queryset(self):
        return self._scoped_tasks(
            Task.objects.filter(lead_id=self.kwargs["lead_id"]).exclude(
                status=Task.Status.PENDING
            )
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        lead = Lead.objects.filter(pk=self.kwargs["lead_id"]).first()
        ctx["task_defs"] = engine.task_defs_for(lead.lead_type) if lead else {}
        return ctx


class TaskDetailView(TaskScopeMixin, generics.RetrieveUpdateAPIView):
    """Retrieve a task, or **Save as Draft** (PATCH ``extra_fields``) — persists
    without closing (Tech Req §6 rule 6 / PRD §5.5). Object permission limits
    editing to the assignee while open.
    """

    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]

    def get_queryset(self):
        return self._scoped_tasks(Task.objects.all())

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        task = self.get_object() if self.request.method != "GET" else None
        lead_type = None
        if task is not None:
            lead_type = task.lead.lead_type
        else:
            obj = self._scoped_tasks(Task.objects.filter(pk=self.kwargs["pk"])).first()
            if obj is not None:
                lead_type = obj.lead.lead_type
        ctx["task_defs"] = engine.task_defs_for(lead_type) if lead_type else {}
        return ctx


class TaskCompleteView(TaskScopeMixin, APIView):
    """**Save & Complete** — validate the task (all checklist items complete +
    mandatory fields filled), close it, and open the next task(s) per the
    workflow routing/branch rules (Tech Req §5–6; PRD §5.5).
    """

    permission_classes = [TaskPermission]

    def post(self, request, pk):
        task = get_object_or_404(self._scoped_tasks(Task.objects.all()), pk=pk)
        if not can_edit_task(request.user, task):
            return Response(
                {"detail": "Only the assigned user can complete an open task."},
                status=status.HTTP_403_FORBIDDEN,
            )
        opened = engine.complete_task(task, request.user)
        task.refresh_from_db()
        # Auto-log the closure and each successor opening; notify new assignees.
        events.log_activity(
            task.lead,
            request.user,
            "task",
            f"Task {task.task_no} “{task.task_name}” completed",
        )
        # Keep the Lead Manager in the loop on every task change (Phase 13).
        _notify_lead_managers(
            task.lead,
            request.user,
            Notification.Type.TASK_COMPLETED,
            f"Task {task.task_no} “{task.task_name}” on “{task.lead.company_name} — "
            f"{task.lead.project_name}” was completed.",
        )
        for nxt in opened:
            events.log_activity(
                task.lead,
                request.user,
                "task",
                f"Task {nxt.task_no} “{nxt.task_name}” opened",
            )
            if nxt.assigned_to_id and nxt.assigned_to_id != request.user.id:
                events.notify(
                    nxt.assigned_to,
                    Notification.Type.TASK_OPENED,
                    f"Task {nxt.task_no} “{nxt.task_name}” is ready for you.",
                    events.lead_link(task.lead),
                )
        defs = engine.task_defs_for(task.lead.lead_type)
        ctx = {"request": request, "task_defs": defs}
        return Response(
            {
                "task": TaskSerializer(task, context=ctx).data,
                "opened_tasks": TaskSerializer(opened, many=True, context=ctx).data,
            }
        )


class TaskReassignView(TaskScopeMixin, APIView):
    """Reassign a task to another active user; it becomes editable for them and
    view-only for the previous assignee (Tech Req §6, Task Reassignment).
    """

    permission_classes = [TaskPermission]

    def post(self, request, pk):
        task = get_object_or_404(self._scoped_tasks(Task.objects.all()), pk=pk)
        if not can_reassign_task(request.user, task):
            return Response(
                {"detail": "You cannot reassign this task."},
                status=status.HTTP_403_FORBIDDEN,
            )
        target = (
            User.objects.filter(pk=request.data.get("assigned_to"), is_active=True)
            .exclude(groups__name=USER_MANAGEMENT)
            .first()
        )
        if target is None:
            return Response(
                {"assigned_to": "Select a valid active user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        prev_name = task.assigned_to.name if task.assigned_to_id else "Not Assigned"
        task.assigned_to = target
        task.save(update_fields=["assigned_to", "updated_at"])
        remark = (request.data.get("remark") or "").strip()
        events.log_activity(
            task.lead,
            request.user,
            "task",
            f"Task {task.task_no} reassigned from {prev_name} to {target.name}",
            remark,
        )
        if target.id != request.user.id:
            events.notify(
                target,
                Notification.Type.TASK_REASSIGNED,
                f"Task {task.task_no} “{task.task_name}” was assigned to you.",
                events.lead_link(task.lead),
            )
        defs = engine.task_defs_for(task.lead.lead_type)
        return Response(
            TaskSerializer(task, context={"request": request, "task_defs": defs}).data
        )


class HeldTaskListView(TaskScopeMixin, generics.ListAPIView):
    """Tasks currently on hold that the caller may see — the "Held Tasks" menu."""

    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]
    pagination_class = None

    def get_queryset(self):
        return self._scoped_tasks(Task.objects.filter(status=Task.Status.HOLD))

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # Held tasks can span lead types; attach every active workflow's defs so
        # each task's field_schema still resolves.
        defs = {}
        for lead_type in Lead.LeadType.values:
            defs.update(engine.task_defs_for(lead_type))
        ctx["task_defs"] = defs
        return ctx


class TaskHoldView(TaskScopeMixin, APIView):
    """Hold (pause) or unhold a single task (Tech Req §6 / PRD §5.8)."""

    permission_classes = [TaskPermission]
    action = None  # "hold" | "unhold", set on the URL

    def post(self, request, pk):
        task = get_object_or_404(self._scoped_tasks(Task.objects.all()), pk=pk)
        if not can_hold_task(request.user, task):
            return Response(
                {"detail": "You cannot hold or unhold this task."},
                status=status.HTTP_403_FORBIDDEN,
            )
        remark = (request.data.get("remark") or "").strip()
        if self.action == "hold":
            if holds.hold_task(task, request.user, reason=remark) is None:
                return Response(
                    {"detail": "Only an open task can be put on hold."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if holds.unhold_task(task, request.user, reason=remark) is None:
                return Response(
                    {"detail": "This task is not on hold."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        events.log_activity(
            task.lead,
            request.user,
            "hold",
            f"Task {task.task_no} {'put on hold' if self.action == 'hold' else 'resumed'}",
            remark,
        )
        verb = "put on hold" if self.action == "hold" else "resumed"
        detail = f": {remark}" if remark else "."
        base_msg = (
            f"Task {task.task_no} on “{task.lead.company_name} — "
            f"{task.lead.project_name}” was {verb}"
        )
        # Notify the task's assignee when someone else changes its hold state…
        if task.assigned_to_id not in (None, request.user.id):
            events.notify(
                task.assigned_to,
                Notification.Type.TASK_HELD,
                base_msg + detail,
                events.lead_link(task.lead),
            )
        # …and always keep the Lead Manager informed of the change (Phase 13).
        _notify_lead_managers(
            task.lead, request.user, Notification.Type.TASK_HELD, base_msg + detail
        )
        task.refresh_from_db()
        defs = engine.task_defs_for(task.lead.lead_type)
        return Response(
            TaskSerializer(task, context={"request": request, "task_defs": defs}).data
        )


# --- Resource allocation + Project closure (Phase 6, RM only) --------------

class ResourceAllocationListView(generics.ListAPIView):
    """All resource-allocation rows — the Resource Manager's reporting screen
    (Tech Req §9.1 / PRD §5.7). Optional ``?lead=`` / ``?status=`` filters.
    """

    serializer_class = ResourceAllocationSerializer
    permission_classes = [ResourceManagerPermission]
    pagination_class = None

    def get_queryset(self):
        qs = ResourceAllocation.objects.select_related(
            "lead", "lead__assigned_to", "allocation_task",
            *ResourceAllocation.SINGLE_RESOURCE_FIELDS,
        ).prefetch_related(*ResourceAllocation.MULTI_RESOURCE_FIELDS)
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        status_val = self.request.query_params.get("status")
        if status_val:
            qs = qs.filter(status=status_val)
        return qs


class LeadResourceAllocationListView(LeadQuerysetMixin, generics.ListAPIView):
    """A single lead's resource allocations — the Lead Detail "Resources" tab (#6).

    Unlike the RM-only :class:`ResourceAllocationListView`, this is scoped by
    lead visibility (``LeadQuerysetMixin``), so the lead's own people (assignee /
    creator / Lead Manager / Lead Admin) can see which resources + man-power were
    allocated, read-only. Editing stays RM-only on the Resources screen.
    """

    serializer_class = ResourceAllocationSerializer
    permission_classes = [LeadPermission]
    pagination_class = None

    def get_lead(self):
        return get_object_or_404(super().get_queryset(), pk=self.kwargs["lead_id"])

    def get_queryset(self):
        return (
            ResourceAllocation.objects.filter(lead=self.get_lead())
            .select_related(
                "lead", "lead__assigned_to", "allocation_task",
                *ResourceAllocation.SINGLE_RESOURCE_FIELDS,
            )
            .prefetch_related(*ResourceAllocation.MULTI_RESOURCE_FIELDS)
        )


class ResourceAllocationDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or edit one allocation row (Resource Manager fills the form).

    PATCH updates the resource FKs + remark; it does **not** close the task —
    that is the explicit ``submit`` action so an RM can save progress first.
    """

    serializer_class = ResourceAllocationSerializer
    permission_classes = [ResourceManagerPermission]

    def get_queryset(self):
        return ResourceAllocation.objects.select_related(
            "lead", "lead__assigned_to", "allocation_task",
            *ResourceAllocation.SINGLE_RESOURCE_FIELDS,
        ).prefetch_related(*ResourceAllocation.MULTI_RESOURCE_FIELDS)


class ResourceAllocationSubmitView(APIView):
    """Submit a filled allocation form (§7.5): mark it Open and close the
    allocation task, opening the next task assigned to the chosen Execution Red.
    """

    permission_classes = [ResourceManagerPermission]

    def post(self, request, pk):
        allocation = get_object_or_404(ResourceAllocation, pk=pk)
        opened = resources.submit_allocation(allocation, request.user)
        allocation.refresh_from_db()
        events.log_activity(
            allocation.lead,
            request.user,
            "resource",
            f"{allocation.type} resources allocated",
        )
        for nxt in opened:
            if nxt.assigned_to_id and nxt.assigned_to_id != request.user.id:
                events.notify(
                    nxt.assigned_to,
                    Notification.Type.TASK_OPENED,
                    f"Task {nxt.task_no} “{nxt.task_name}” is ready for you.",
                    events.lead_link(allocation.lead),
                )
        defs = engine.task_defs_for(allocation.lead.lead_type)
        return Response(
            {
                "allocation": ResourceAllocationSerializer(
                    allocation, context={"request": request}
                ).data,
                "opened_tasks": TaskSerializer(
                    opened, many=True, context={"request": request, "task_defs": defs}
                ).data,
            }
        )


class AllocationUserListView(generics.ListAPIView):
    """Active users selectable in the allocation form's resource dropdowns.

    Per the user, the task-assignment screen allocates only **Lead Manager or
    Employee** people — Marketing, Finance, Resource Manager, Lead Admin and
    User Management are excluded (see :data:`NON_ASSIGNABLE_GROUPS`). RM-only.
    """

    serializer_class = AssignableUserSerializer
    permission_classes = [ResourceManagerPermission]
    pagination_class = None

    def get_queryset(self):
        return (
            User.objects.filter(is_active=True, is_superuser=False)
            .exclude(groups__name__in=NON_ASSIGNABLE_GROUPS)
            .order_by("name")
            .distinct()
        )


class ProjectClosureListView(generics.ListAPIView):
    """One row per project cycle — the Project Closure screen (§9.2 / §5.12).

    Lists every ``project_details`` row (first-time implementation + each
    extension), not one per lead. Optional ``?lead=`` filter. RM-only.
    """

    serializer_class = ProjectDetailsSerializer
    permission_classes = [ResourceManagerPermission]
    pagination_class = None

    def get_queryset(self):
        qs = ProjectDetails.objects.select_related(
            "lead", "lead__assigned_to", "resource_allocation",
            "resource_allocation__execution_red",
            "resource_allocation__execution_brown",
        ).prefetch_related(
            "resource_allocation__whites",
        ).order_by("lead", "extension_no")
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        return qs


class ProjectClosureShortCloseView(APIView):
    """Short-close the current project cycle (§9.2): open the Project-Closure
    task so the engagement can be finished ahead of its natural end.
    """

    permission_classes = [ResourceManagerPermission]

    def post(self, request, pk):
        detail = get_object_or_404(
            ProjectDetails.objects.select_related("lead"), pk=pk
        )
        if not detail.is_current:
            return Response(
                {"detail": "Short-close applies only to the current project cycle."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        opened = engine.open_project_closure(detail.lead, request.user)
        if opened is None:
            return Response(
                {"detail": "Project closure is already open or the lead is complete."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        defs = engine.task_defs_for(detail.lead.lead_type)
        return Response(
            TaskSerializer(opened, context={"request": request, "task_defs": defs}).data,
            status=status.HTTP_201_CREATED,
        )


# --- Follow-ups & Other Tasks (Phase 7, Tech Req §4.10, §8; PRD §5.11) -------

class FollowupScopeMixin:
    """Role-scoped follow-up queryset matching :func:`can_view_followup`.

    Lead Admin sees every follow-up; everyone else sees follow-ups assigned to
    them or that they raised. ``?lead=`` narrows to one lead (the Lead Detail
    follow-up tab / "View all follow-up history"); ``?assigned_to_me=`` narrows
    to the caller's own follow-ups (the "Other Tasks" screen) — those assigned
    to them **or** raised by them, so a creator still sees a follow-up they
    assigned to someone else.
    """

    def _scoped_followups(self, base_qs=None):
        user = self.request.user
        qs = (base_qs if base_qs is not None else Followup.objects.all()).select_related(
            "lead", "assigned_to", "created_by"
        ).prefetch_related("updates__author")
        if LEAD_ADMIN not in user_role_names(user):
            qs = qs.filter(Q(assigned_to=user) | Q(created_by=user))
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        if self.request.query_params.get("assigned_to_me"):
            # "Mine" = assigned to me or created by me (the creator keeps sight
            # of follow-ups they raised for others, per the user).
            qs = qs.filter(Q(assigned_to=user) | Q(created_by=user))
        return qs.distinct()


class FollowupListCreateView(FollowupScopeMixin, generics.ListCreateAPIView):
    """List the caller's follow-ups (Other Tasks / a lead's tab) or raise a new
    one (any authenticated user who can view the target lead — Phase 12; the
    permission class + perform_create enforce it).
    """

    serializer_class = FollowupSerializer
    permission_classes = [FollowupPermission]

    def get_queryset(self):
        return self._scoped_followups()

    def perform_create(self, serializer):
        # A follow-up may only be raised on a lead the caller can see (Phase 12
        # opened creation beyond Lead Managers, so this is now the real guard).
        lead = serializer.validated_data["lead"]
        if not user_can_view_lead(self.request.user, lead):
            raise PermissionDenied("You cannot raise a follow-up on this lead.")
        followup = serializer.save(created_by=self.request.user)
        events.log_activity(
            followup.lead,
            self.request.user,
            "followup",
            f"Follow-up “{followup.title}” raised for {followup.assigned_to.name}",
        )
        if followup.assigned_to_id != self.request.user.id:
            events.notify(
                followup.assigned_to,
                Notification.Type.FOLLOWUP,
                f"New follow-up “{followup.title}” due {followup.followup_date}.",
                events.lead_link(followup.lead),
            )


class FollowupDetailView(FollowupScopeMixin, generics.RetrieveUpdateAPIView):
    """Retrieve a follow-up, or update its status/remark (creator/assignee/admin).

    No destroy — follow-ups are closed via ``status = done``, not deleted.
    """

    serializer_class = FollowupSerializer
    permission_classes = [FollowupPermission]

    def get_queryset(self):
        return self._scoped_followups()


class FollowupUpdateListCreateView(FollowupScopeMixin, generics.ListCreateAPIView):
    """The comment thread on one follow-up. Anyone who may edit the follow-up
    (creator/assignee/admin) can add a comment; the author is the caller.
    """

    serializer_class = FollowupUpdateSerializer
    # Authorization is the scoped parent lookup (view = in-scope) + the
    # can_edit_followup check in perform_create (comment = creator/assignee/
    # admin); FollowupPermission's LM-only POST rule does not apply to comments.
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def _get_followup(self):
        followup = get_object_or_404(
            self._scoped_followups(), pk=self.kwargs["followup_id"]
        )
        return followup

    def get_queryset(self):
        return self._get_followup().updates.select_related("author")

    def perform_create(self, serializer):
        followup = self._get_followup()
        if not can_edit_followup(self.request.user, followup):
            raise PermissionDenied("You cannot comment on this follow-up.")
        serializer.save(followup=followup, author=self.request.user)


class FollowupAssigneeListView(generics.ListAPIView):
    """Active users selectable as a follow-up's assignee.

    The docs describe the dropdown as "Employee-role users, including the Lead
    Manager themself"; since Employee is the baseline role every user holds
    (CLAUDE.md), this returns all active users. Open to any authenticated user
    (Phase 12 broadened follow-up creation beyond Lead-Manager-only), so any
    creator can load the assignee list.
    """

    serializer_class = AssignableUserSerializer
    permission_classes = [CanAddFollowupPermission]
    pagination_class = None

    def get_queryset(self):
        return (
            User.objects.filter(is_active=True, is_superuser=False)
            .exclude(groups__name=USER_MANAGEMENT)
            .order_by("name")
        )


class ChecklistItemUpdateView(generics.UpdateAPIView):
    """Update a single checklist item (status + remark), independently of task
    closure (Tech Req §4.5). Stamps the editor + timestamp on every save.
    """

    serializer_class = ChecklistSerializer
    permission_classes = [TaskPermission]
    http_method_names = ["patch", "put"]

    def get_object(self):
        item = get_object_or_404(
            Checklist.objects.select_related("task__lead", "task__assigned_to"),
            pk=self.kwargs["pk"],
        )
        # Reuse the task's object-level permission (edit = assignee, open only).
        self.check_object_permissions(self.request, item.task)
        return item

    def perform_update(self, serializer):
        prev_status = serializer.instance.status
        item = serializer.save(
            last_edited_by=self.request.user,
            last_edited_at=timezone.now(),
        )
        # Auto-log checklist progress on the lead's Activity feed (PRD §6). A
        # status change (which moves the lead's overall progress) or a remark is
        # worth recording; a no-op save is not. Best-effort/additive — mirrors
        # the log_activity pattern used on task completion.
        status_changed = item.status != prev_status
        remark = (item.remark or "").strip()
        if status_changed or remark:
            if status_changed:
                summary = f'Checklist "{item.item_label}" marked {item.get_status_display()}'
            else:
                summary = f'Checklist "{item.item_label}" updated'
            events.log_activity(
                item.task.lead,
                self.request.user,
                "checklist",
                summary,
                remark,
            )


# --- Activity log + Attachments (Phase 8, PRD §6 / Decision #4) -------------

class LeadActivityListView(LeadQuerysetMixin, generics.ListAPIView):
    """A lead's auto-logged activity — the Lead Detail "Activity" tab.

    The lead is looked up through the role-scoped queryset, so activity
    visibility inherits lead visibility (§6 "own vs all activity log"): a Lead
    Admin sees any lead's log, a Lead Manager only their own leads'.
    """

    serializer_class = ActivityLogSerializer
    permission_classes = [LeadPermission]
    pagination_class = None

    def get_lead(self):
        return get_object_or_404(super().get_queryset(), pk=self.kwargs["lead_id"])

    def get_queryset(self):
        return ActivityLog.objects.filter(lead=self.get_lead()).select_related("actor")


class LeadAttachmentListCreateView(LeadQuerysetMixin, generics.ListCreateAPIView):
    """List / upload files on a lead — the Lead Detail "Files" tab (Decision #4).

    Anyone who can see the lead may view and upload; the 5 MB cap is enforced in
    the serializer. The lead is resolved through the role-scoped queryset.
    """

    serializer_class = AttachmentSerializer
    permission_classes = [LeadPermission]
    pagination_class = None
    parser_classes = [MultiPartParser, FormParser]

    def get_lead(self):
        return get_object_or_404(super().get_queryset(), pk=self.kwargs["lead_id"])

    def get_queryset(self):
        return Attachment.objects.filter(lead=self.get_lead()).select_related(
            "uploaded_by"
        )

    def perform_create(self, serializer):
        lead = self.get_lead()
        upload = serializer.validated_data["file"]
        serializer.save(
            lead=lead, uploaded_by=self.request.user, filename=upload.name
        )


class AttachmentDeleteView(LeadQuerysetMixin, generics.DestroyAPIView):
    """Delete a lead attachment. Restricted to the users who steer the lead —
    its Lead-Manager owner/creator or a Lead Admin (``can_hold_lead``).

    The queryset is scoped to leads the caller can see (so an out-of-scope
    lead's attachment 404s); ``perform_destroy`` enforces the tighter delete
    right. ``LeadPermission`` is not used here — its object check expects a Lead.
    """

    serializer_class = AttachmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        leads = super().get_queryset()
        return Attachment.objects.filter(lead__in=leads)

    def perform_destroy(self, instance):
        if not can_hold_lead(self.request.user, instance.lead):
            raise PermissionDenied("You cannot delete files on this lead.")
        instance.file.delete(save=False)
        instance.delete()


# --- Notifications (Phase 8, Decision #4) ----------------------------------

class NotificationListView(generics.ListAPIView):
    """The caller's own in-app notifications, newest first."""

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)


class NotificationMarkReadView(APIView):
    """Mark one of the caller's notifications read."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """Mark all of the caller's unread notifications read."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({"updated": updated})


# --- Leads-funnel dashboard (Phase 8, PRD §6) ------------------------------

class DashboardView(LeadQuerysetMixin, APIView):
    """Leads-funnel aggregation for the landing dashboard (PRD §6).

    Scope follows lead visibility: a Lead Admin's funnel spans every lead, a
    Lead Manager's / Marketing's their own — the §6 "own vs all leads-funnel"
    rows. Users with no lead scope (Employee/Resource Manager) get an empty
    funnel and rely on the follow-up/task counts, which are always their own.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        leads = super().get_queryset()

        counts = dict(
            leads.values_list("status").annotate(n=Count("id")).values_list("status", "n")
        )
        count_by_status = [
            {"status": value, "count": counts.get(value, 0)}
            for value in Lead.Status.values
        ]

        active_qs = leads.filter(
            status__in=[Lead.Status.IN_PROGRESS, Lead.Status.ON_HOLD]
        ).prefetch_related("tasks")
        active_leads = []
        for lead in active_qs:
            tasks = [
                t for t in lead.tasks.all() if t.status != Task.Status.SKIPPED
            ]
            total = len(tasks)
            closed = sum(1 for t in tasks if t.status == Task.Status.CLOSED)
            progress = round(closed / total * 100) if total else 0
            active_leads.append(
                {
                    "id": lead.id,
                    "company_name": lead.company_name,
                    "project_name": lead.project_name,
                    "status": lead.status,
                    "project_id": lead.project_id,
                    "progress": progress,
                }
            )

        today = timezone.now().date()
        overdue = (
            Followup.objects.filter(
                assigned_to=request.user,
                status=Followup.Status.OPEN,
                followup_date__lt=today,
            )
            .select_related("lead")
            .order_by("followup_date")
        )
        overdue_followups = [
            {
                "id": f.id,
                "lead": f.lead_id,
                "title": f.title,
                "followup_date": f.followup_date,
            }
            for f in overdue
        ]

        return Response(
            {
                "total_leads": leads.count(),
                "active_lead_count": len(active_leads),
                "completed_count": counts.get(Lead.Status.COMPLETE, 0),
                "dropped_count": counts.get(Lead.Status.DROPPED, 0),
                "count_by_status": count_by_status,
                "active_leads": active_leads,
                "overdue_followups": overdue_followups,
            }
        )
