from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import analytics, engine, events, holds, projects, resources
from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    Lead,
    LeadComment,
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
    AllocationActionPermission,
    CanAddFollowupPermission,
    CanAssignOwnerPermission,
    FinancePermission,
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
    can_work_allocation_task,
    user_role_names,
)
from .serializers import (
    ActivityLogSerializer,
    AssignableUserSerializer,
    AttachmentSerializer,
    ChecklistSerializer,
    FollowupSerializer,
    FollowupUpdateSerializer,
    LeadCommentSerializer,
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
    - **Anyone** — leads they own (``assigned_to``), are actively working a task
      on (``tasks__assigned_to``), or are/were the lead's **Execution Red**
      (R9 — the Red sees the whole lead, mirroring
      :func:`permissions.is_execution_red`). *(The Phase-13 rule that gave every
      allocation slot-holder this access was rescinded per PRD v3 / Tech Req v16
      — Phase 14a; R9 reinstates it for the Execution Red only.)*
    - **Lead Manager / Marketing** — additionally the leads they created.
    - **Resource Manager** — additionally any lead that has reached an
      allocation task (3/10/17/18/24/25, R5) — checked by task, not by a
      ``resource_allocation`` row, so the lead is visible from the moment
      staffing is needed, before anyone has been allocated yet.
    - **Finance** — additionally any lead that has reached a payment-approval
      gate task (7/15/28), so the gate can be worked from the lead detail (§5.10).
    """
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return None
    scope = (
        Q(assigned_to=user)
        | Q(tasks__assigned_to=user)
        | Q(
            resource_allocations__slot=ResourceAllocation.Slot.EXECUTION_RED,
            resource_allocations__user=user,
        )
    )
    if roles & {LEAD_MANAGER, MARKETING}:
        scope |= Q(created_by=user)
    if RESOURCE_MANAGER in roles:
        scope |= Q(tasks__is_allocation_task=True)
    if FINANCE in roles:
        scope |= Q(tasks__is_finance_gate=True)
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
        ).prefetch_related("tasks", "stages")
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


def _notify_task_opened(task, actor):
    """Tell a freshly-opened task's assignee it's waiting for them.

    Skipped when the actor is the assignee (they just watched it open) or when
    the engine has already announced the open in its own words —
    ``open_announced``, set by :func:`engine._announce_mining_window`.
    """
    if not task.assigned_to_id or task.assigned_to_id == actor.id:
        return
    if getattr(task, "open_announced", False):
        return
    events.notify(
        task.assigned_to,
        Notification.Type.TASK_OPENED,
        f"Task {task.task_no} “{task.task_name}” is ready for you.",
        events.lead_link(task.lead),
    )


def _notify_lead_managers(lead, actor, type, message):
    """Notify the lead's managing people of a task event — thin wrapper kept for
    the call sites in this module; see :func:`events.notify_lead_managers`."""
    events.notify_lead_managers(lead, type, message, actor=actor)


class LeadListCreateView(LeadQuerysetMixin, generics.ListCreateAPIView):
    serializer_class = LeadSerializer
    permission_classes = [LeadPermission]

    def perform_create(self, serializer):
        # created_by records whether the lead originated from Marketing or a
        # Lead Manager (Tech Req §4.3); the client can never set it.
        lead = serializer.save(created_by=self.request.user)
        # R2: allocate the stable base_code ({Country}-{Industry}{Area}{Type}{YY}{Seq}, §13) and open
        # the lead's initial stage so the derived Project ID resolves from
        # creation onward. Per-task stage transitions land in R3.
        projects.initialize_new_lead(lead)
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
            # R9-4: hand the work over too, not just the label — the task in
            # flight moves to the new owner immediately (see
            # engine.reassign_owner_tasks for the Execution-Red carve-out).
            engine.reassign_owner_tasks(
                lead, prev_assigned, lead.assigned_to, self.request.user
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
        # R9: the lead's Execution Red sees every step of it, like the owner —
        # matches permissions.is_execution_red (any Red row, released or not).
        conds = (
            Q(assigned_to=user)
            | Q(lead__assigned_to=user)
            | Q(
                lead__resource_allocations__slot=ResourceAllocation.Slot.EXECUTION_RED,
                lead__resource_allocations__user=user,
            )
        )
        if LEAD_MANAGER in roles:
            conds |= Q(lead__created_by=user)
        # Finance works the payment-approval gates from the Accounts queue — they
        # open unassigned, so scope them in by their flag (§5.10 / §12).
        if FINANCE in roles:
            conds |= Q(is_finance_gate=True)
        # Same for the Resource Manager and the allocation tasks (3/10/17/18/24/25)
        # — matches permissions.can_view_task, so the allocation step shows up in
        # the stepper of any lead they open from the Leads tab (R10-1).
        if RESOURCE_MANAGER in roles:
            conds |= Q(is_allocation_task=True)
        return qs.filter(conds).distinct()


class LeadTaskListView(TaskScopeMixin, generics.ListAPIView):
    """All tasks the caller may see under one lead — the stepper's data source.

    ``pending`` (trigger-gated, not yet due) rows are **included** so that
    trigger-scheduled steps — notably the allocation tasks (Task 3 etc.) that
    open ``pending`` weeks before their reference date — are staffable inline in
    the lead's task stepper instead of only from the Resources queue. Each
    pending row carries its ``scheduled_open`` banner (see
    ``TaskSerializer.get_scheduled_open``). This re-activates the Phase-13e
    pending banner that Tech Req §6 rule 8 v14 had suppressed (per user, 2026-07-28).
    """

    serializer_class = TaskSerializer
    permission_classes = [TaskPermission]
    pagination_class = None

    def get_queryset(self):
        return self._scoped_tasks(
            Task.objects.filter(lead_id=self.kwargs["lead_id"])
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
            _notify_task_opened(nxt, request.user)
        defs = engine.task_defs_for(task.lead.lead_type)
        ctx = {"request": request, "task_defs": defs}
        payload = {
            "task": TaskSerializer(task, context=ctx).data,
            "opened_tasks": TaskSerializer(opened, many=True, context=ctx).data,
        }
        # Task 21 "go-ahead = Yes" spawned a Mining lead (R6, §5.3.1) — hand the
        # new lead back so the UI can alert the user in the same interaction
        # instead of leaving them to notice it in the leads list later.
        spawned = getattr(task, "spawned_mining_lead", None)
        if spawned is not None:
            payload["spawned_lead"] = {
                "id": spawned.id,
                "lead_type": spawned.lead_type,
                "company_name": spawned.company_name,
                "project_name": spawned.project_name,
                "project_id": projects.derived_project_id(spawned),
                "assigned_to_name": (
                    spawned.assigned_to.name if spawned.assigned_to_id else None
                ),
                # R19: the child starts on the flow-selection task, so the toast
                # can tell its owner that a decision is waiting rather than
                # implying the workflow is already under way.
                "awaiting_flow_selection": not spawned.flow_of_tasks,
                "first_task_no": getattr(
                    getattr(spawned, "entry_task", None), "task_no", None
                ),
                "first_task_name": getattr(
                    getattr(spawned, "entry_task", None), "task_name", None
                ),
                "link": events.lead_link(spawned),
            }
        return Response(payload)


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


class FinanceGateListView(TaskScopeMixin, generics.ListAPIView):
    """The Accounts queue — open payment-approval gate tasks (7/15/28) for Finance.

    Finance answers *"Payment received against all invoices?"* per gate: Yes
    closes it (workflow proceeds / lead completes at Task 28); No closes it with
    a remark and re-opens the preceding money task (§5.10). Working a gate reuses
    the standard task endpoints (Save-as-Draft PATCH + complete) — this view just
    lists the queue with each gate's field schema so the control can render.
    """

    serializer_class = TaskSerializer
    permission_classes = [FinancePermission]
    pagination_class = None

    def get_queryset(self):
        return self._scoped_tasks(
            Task.objects.filter(is_finance_gate=True, status=Task.Status.OPEN)
        )

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        defs = {}
        for lead_type in Lead.LeadType.values:
            defs.update(engine.task_defs_for(lead_type))
        ctx["task_defs"] = defs
        return ctx


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


# --- Resource allocation + Project closure (R5 rebuild — append-only slots) -

def _allocation_row_qs():
    return ResourceAllocation.objects.select_related(
        "lead", "lead__assigned_to", "stage", "task", "user", "replaces",
    )


class ResourceAllocationListView(generics.ListAPIView):
    """All resource-allocation rows — the Resource Manager's reporting /
    resource-history screen (Tech Req §9.1 / PRD §5.7). Optional ``?lead=`` /
    ``?status=`` / ``?slot=`` filters. Each row carries enough (slot, stage,
    user, allocated_on/released_on, replaces) for the frontend to derive
    days-worked and reassignment chains without a bespoke aggregation endpoint.
    """

    serializer_class = ResourceAllocationSerializer
    permission_classes = [ResourceManagerPermission]
    pagination_class = None

    def get_queryset(self):
        qs = _allocation_row_qs()
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        status_val = self.request.query_params.get("status")
        if status_val:
            qs = qs.filter(status=status_val)
        slot = self.request.query_params.get("slot")
        if slot:
            qs = qs.filter(slot=slot)
        return qs


class LeadResourceAllocationListView(LeadQuerysetMixin, generics.ListAPIView):
    """A single lead's resource-allocation history — the Lead Detail "Resources"
    tab. Unlike the RM-only :class:`ResourceAllocationListView`, this is scoped
    by lead visibility (``LeadQuerysetMixin``), so the lead's own people
    (assignee / creator / Lead Manager / Lead Admin) can see who was allocated,
    read-only. Editing stays on the allocation-task actions below.
    """

    serializer_class = ResourceAllocationSerializer
    permission_classes = [LeadPermission]
    pagination_class = None

    def get_lead(self):
        return get_object_or_404(super().get_queryset(), pk=self.kwargs["lead_id"])

    def get_queryset(self):
        qs = _allocation_row_qs().filter(lead=self.get_lead())
        # R12: the named extras (Auditors 3–4, Project Members 1–10) are the
        # Resource Manager's own working detail — this lead-facing tab shows the
        # Red/Brown/White picture only.
        if not resources.is_resource_manager(self.request.user):
            qs = qs.exclude(slot__in=ResourceAllocation.EXTENDED_SLOTS)
        return qs


class AllocationTaskListView(generics.ListAPIView):
    """Every allocation task (3/10/17/18/24/25, R5) the caller may staff —
    the Resources screen's main list. The Resource Manager sees every one
    (across every lead); the Default BD Person (D12) sees only their own
    leads'. Optional ``?status=`` (defaults to every status) / ``?lead=``.

    ``?status=`` accepts a comma-separated list (R12) — the screen's "To do"
    filter is ``open,pending``, since a trigger-gated allocation task is
    staffable *in advance*, while still pending (that's how the auditors get
    allocated before Task 18's date arrives).
    """

    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = Task.objects.filter(is_allocation_task=True).select_related(
            "lead", "lead__assigned_to", "stage",
        ).order_by("-id")
        if RESOURCE_MANAGER not in user_role_names(self.request.user):
            qs = qs.filter(lead__assigned_to=self.request.user)
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        status_val = self.request.query_params.get("status")
        if status_val:
            wanted = [s.strip() for s in status_val.split(",") if s.strip()]
            qs = qs.filter(status__in=wanted)
        return qs

    def get_serializer_context(self):
        # One unified 28-task workflow (DD1) — every lead type resolves to the
        # same graph, so a single task_defs map covers this cross-lead list.
        context = super().get_serializer_context()
        context["task_defs"] = engine.task_defs_for(Lead.LeadType.BD)
        return context


class AllocationTaskActionView(APIView):
    """Base for the allocation slot-action endpoints — resolves the target
    :class:`Task` once (``get_task``), used both by the action itself and by
    :class:`AllocationActionPermission` (D12: Resource Manager or the lead's
    Default BD Person).
    """

    permission_classes = [AllocationActionPermission]

    def get_task(self):
        if not hasattr(self, "_task"):
            self._task = get_object_or_404(
                Task.objects.select_related("lead", "stage"),
                pk=self.kwargs["task_id"], is_allocation_task=True,
            )
        return self._task

    def _tdef(self, task):
        defs = engine.task_defs_for(task.lead.lead_type)
        tdef = defs.get(task.task_no)
        if tdef is None:
            raise NotFound("This task is not part of the active workflow.")
        return tdef

    def _task_response(self, task, request):
        defs = engine.task_defs_for(task.lead.lead_type)
        return Response(
            TaskSerializer(task, context={"request": request, "task_defs": defs}).data
        )


class AllocationAllocateView(AllocationTaskActionView):
    """First fill of a slot (§4.7) — ``{"slot", "user_id", "remark"?}``."""

    def post(self, request, task_id):
        task = self.get_task()
        tdef = self._tdef(task)
        user_id = request.data.get("user_id")
        user = get_object_or_404(User, pk=user_id) if user_id else None
        row = resources.allocate(
            task, tdef, request.data.get("slot"),
            user=user, remark=request.data.get("remark", ""), actor=request.user,
        )
        events.log_activity(
            task.lead, request.user, "resource",
            f"{ResourceAllocation.Slot(row.slot).label} allocated to {row.user.name}"
            f" — {task.task_name}",
        )
        return self._task_response(task, request)


class AllocationReassignView(AllocationTaskActionView):
    """Release + append a replacement (§4.7) —
    ``{"allocation_id", "user_id", "remark"?}``."""

    def post(self, request, task_id):
        task = self.get_task()
        current = get_object_or_404(
            ResourceAllocation, pk=request.data.get("allocation_id"), task=task,
        )
        user_id = request.data.get("user_id")
        user = get_object_or_404(User, pk=user_id) if user_id else None
        new_row = resources.reassign(
            task, current, user=user,
            actor=request.user, remark=request.data.get("remark", ""),
        )
        events.log_activity(
            task.lead, request.user, "resource",
            f"{ResourceAllocation.Slot(new_row.slot).label} reassigned to "
            f"{new_row.user.name} — {task.task_name}",
        )
        return self._task_response(task, request)


class AllocationReleaseView(AllocationTaskActionView):
    """Free a slot with no replacement — ``{"allocation_id"}``."""

    def post(self, request, task_id):
        task = self.get_task()
        row = get_object_or_404(
            ResourceAllocation, pk=request.data.get("allocation_id"), task=task,
        )
        resources.release(row, actor=request.user)
        events.log_activity(
            task.lead, request.user, "resource",
            f"{ResourceAllocation.Slot(row.slot).label} released — {task.task_name}",
        )
        return self._task_response(task, request)


class AllocationSubmitView(AllocationTaskActionView):
    """Submit a staffed allocation task (§7.5): validates the mandatory slots,
    completes the task, and opens the next task assigned to the chosen
    Execution Red.
    """

    def post(self, request, task_id):
        task = self.get_task()
        tdef = self._tdef(task)
        opened = resources.submit(task, tdef, request.user)
        task.refresh_from_db()
        events.log_activity(
            task.lead, request.user, "resource", f"{task.task_name} — resources allocated",
        )
        for nxt in opened:
            _notify_task_opened(nxt, request.user)
        defs = engine.task_defs_for(task.lead.lead_type)
        return Response(
            {
                "task": TaskSerializer(task, context={"request": request, "task_defs": defs}).data,
                "opened_tasks": TaskSerializer(
                    opened, many=True, context={"request": request, "task_defs": defs}
                ).data,
            }
        )


# Which belt names qualify a user for each allocation dropdown — a user
# qualifies if *either* their Belt or Acting Belt Level matches (both fields
# source the same `belts` table). Auditor slots are not belt-gated, so they're
# absent here and fall through to the unfiltered list.
ALLOCATION_SLOT_BELTS = {
    "execution_red": ["Red", "Potential Red"],
    "execution_brown": ["Brown", "Potential Brown"],
    "white": ["White", "Potential White"],
}


class AllocationUserListView(generics.ListAPIView):
    """Active users selectable in the allocation form's resource dropdowns.

    Allocates only **Lead Manager or Employee** people — Marketing, Finance,
    Resource Manager, Lead Admin and User Management are excluded (see
    :data:`NON_ASSIGNABLE_GROUPS`). Scoped like the slot actions (D12): the
    Resource Manager, or the ``?task=`` lead's Default BD Person.

    ``?task=<allocation_task id>`` is required (ties the picker to a specific
    lead for the BD-owner check). An optional ``?slot=`` further narrows the
    list to users whose Belt or Acting Belt Level matches that slot's role —
    e.g. ``?slot=execution_red`` only offers Red/Potential Red people.
    """

    serializer_class = AssignableUserSerializer
    permission_classes = [AllocationActionPermission]
    pagination_class = None

    def get_task(self):
        if not hasattr(self, "_task"):
            task_id = self.request.query_params.get("task")
            self._task = (
                Task.objects.select_related("lead").filter(
                    pk=task_id, is_allocation_task=True
                ).first()
                if task_id else None
            )
        return self._task

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if self.get_task() is None:
            raise NotFound("A valid ?task= allocation task id is required.")

    def get_queryset(self):
        qs = (
            User.objects.filter(is_active=True, is_superuser=False)
            .exclude(groups__name__in=NON_ASSIGNABLE_GROUPS)
        )
        belt_names = ALLOCATION_SLOT_BELTS.get(self.request.query_params.get("slot"))
        if belt_names:
            qs = qs.filter(
                Q(belt__name__in=belt_names) | Q(acting_belt_level__name__in=belt_names)
            )
        return qs.order_by("name").distinct()


class ProjectClosureListView(generics.ListAPIView):
    """One row per completed project cycle — the Project Closure screen
    (§9.2 / §5.12, R6 rebuild).

    Lists every ``project_details`` row (Implementation + each Extension loop),
    not one per lead. ``?lead=<id>`` broadens to that lead's whole
    ``base_code`` family — the parent plus any Mining children share one
    ``base_code`` (§13), so the screen shows implementation, every extension,
    and any mining cycle "together" (§9.2) without a special case. RM-only.
    """

    serializer_class = ProjectDetailsSerializer
    permission_classes = [ResourceManagerPermission]
    pagination_class = None

    def get_queryset(self):
        qs = ProjectDetails.objects.select_related(
            "lead", "lead__assigned_to", "stage",
        ).order_by("lead__base_code", "generated_at", "id")
        lead_id = self.request.query_params.get("lead")
        if lead_id:
            lead = get_object_or_404(Lead.objects.all(), pk=lead_id)
            if lead.base_code:
                qs = qs.filter(lead__base_code=lead.base_code)
            else:
                qs = qs.filter(lead_id=lead_id)
        return qs


class LeadShortCloseView(APIView):
    """Short-close a lead (§9.2/§5.12, R6): open the Project-Closure task ahead
    of its natural trigger.

    A lead-scoped action now — the current Extension-Implementation cycle it
    acts on hasn't produced a ``project_details`` row yet (that only happens
    when its own closing task completes normally, §4.8), so this can no longer
    key off one. RM-only, and only while :func:`engine.can_short_close` allows
    it (Task 26 has opened at some point and closure hasn't been reached yet).
    """

    permission_classes = [ResourceManagerPermission]

    def post(self, request, pk):
        lead = get_object_or_404(Lead.objects.all(), pk=pk)
        # A remark is compulsory (Phase 16 follow-up) so a project is never
        # short-closed by accident — mirrors the hold/unhold remark, but required.
        remark = (request.data.get("remark") or "").strip()
        if not remark:
            return Response(
                {"remark": ["A remark is required to short-close a project."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        opened = engine.open_project_closure(lead, request.user, remark=remark)
        if opened is None:
            return Response(
                {"detail": "Short-close isn't available for this lead right now."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        events.log_activity(
            lead,
            request.user,
            "status",
            f"Project short-closed ({projects.derived_project_id(lead)})",
            remark,
        )
        defs = engine.task_defs_for(lead.lead_type)
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
        followup = serializer.save(
            created_by=self.request.user,
            project_id=projects.row_project_id(lead),  # R9-1 display snapshot
        )
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


class LeadCommentListCreateView(LeadQuerysetMixin, generics.ListCreateAPIView):
    """A lead's **Lead Trail** — list + append comments (R23-1, user 2026-08-05).

    List and create only: the trail is append-only, so there is no update or
    delete route (and none in the admin's normal path either). The lead is
    resolved through the role-scoped queryset, so **visibility is the
    permission** — everyone the workflow puts on this lead (its owner, its
    creator, the Execution Red, whoever holds an open task, the Resource Manager
    on an allocation task) plus the Lead Admin can both read the trail and add to
    it, which is exactly the set the user asked for. An out-of-scope lead 404s.

    ``author`` comes from the request, never the payload.

    ``IsAuthenticated`` rather than ``LeadPermission`` on purpose:
    ``LeadPermission``'s POST branch is the rule for *creating a lead*
    (Lead Manager / Marketing only), which would shut the Execution Red and the
    Lead Admin — two of the people the user explicitly named — out of the trail.
    The role-scoped queryset above is what enforces access here, exactly as it
    does for ``AttachmentDeleteView``: an out-of-scope lead 404s.
    """

    serializer_class = LeadCommentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_lead(self):
        return get_object_or_404(super().get_queryset(), pk=self.kwargs["lead_id"])

    def get_queryset(self):
        return LeadComment.objects.filter(lead=self.get_lead()).select_related("author")

    def perform_create(self, serializer):
        lead = self.get_lead()
        serializer.save(
            lead=lead,
            author=self.request.user,
            project_id=projects.row_project_id(lead),  # R9-1 display snapshot
        )
        # R23-1e: a trail nobody is told about is a dead letterbox. The lead's
        # owner + creator hear about it (never the author) — the same recipients
        # every other lead-level change notifies.
        events.notify_lead_managers(
            lead,
            Notification.Type.LEAD_COMMENT,
            f"{self.request.user.name} commented on “{lead.company_name} — "
            f"{lead.project_name}”.",
            actor=self.request.user,
        )


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
            lead=lead,
            uploaded_by=self.request.user,
            filename=upload.name,
            project_id=projects.row_project_id(lead),  # R9-1 display snapshot
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

#: Read notifications older than this are pruned on read (see
#: :func:`_prune_read_notifications`). Unread rows are never auto-deleted.
NOTIFICATION_RETENTION_DAYS = 30

#: How often the prune runs per user, in seconds. The bell polls every 15s, so
#: the sweep is throttled through the cache rather than run on every request.
NOTIFICATION_PRUNE_EVERY = 60 * 60


def _prune_read_notifications(user):
    """Best-effort delete of the user's long-read notifications.

    Runs at most once an hour per user (cache-throttled) off the back of a list
    request, so the table self-maintains without a cron entry. Failures are
    swallowed — pruning must never break the feed.
    """
    key = f"notif-prune:{user.pk}"
    if cache.get(key):
        return
    cache.set(key, True, NOTIFICATION_PRUNE_EVERY)
    cutoff = timezone.now() - timedelta(days=NOTIFICATION_RETENTION_DAYS)
    Notification.objects.filter(
        user=user, is_read=True, created_at__lt=cutoff
    ).delete()


class NotificationPagination(PageNumberPagination):
    """Paginates the notification feed and carries the unread count with it.

    The bell needs the badge number and a short preview from one request, so
    the count rides along in the envelope instead of costing a second call.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        response = super().get_paginated_response(data)
        response.data["unread_count"] = self.request._notification_unread_count
        return response


class NotificationListView(generics.ListAPIView):
    """The caller's own in-app notifications, newest first.

    Paginated (default 20/page, ``?page_size=`` up to 100) and filterable with
    ``?unread=1`` — previously this returned every notification the user had
    ever received, which is what made the bell and the page unbounded.
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NotificationPagination

    def get_queryset(self):
        _prune_read_notifications(self.request.user)
        qs = Notification.objects.filter(user=self.request.user)
        # The unread badge counts everything unread, not just the current page.
        self.request._notification_unread_count = qs.filter(is_read=False).count()
        if self.request.query_params.get("unread") in ("1", "true", "True"):
            qs = qs.filter(is_read=False)
        return qs


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


class NotificationClearReadView(APIView):
    """Delete the caller's already-read notifications.

    The manual counterpart to :func:`_prune_read_notifications` — lets a user
    empty a backlog now instead of waiting out the retention window. Unread
    notifications are left alone.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        deleted, _ = Notification.objects.filter(
            user=request.user, is_read=True
        ).delete()
        return Response({"deleted": deleted})


# --- Role dashboards (Phase 8, rebuilt in R20 — PRD §6) ---------------------
#
# One endpoint per module, each gated by the permission class that already owns
# that module (DD-R20-1). The aggregation itself lives in `analytics.py`; these
# views are the gate and the envelope.


class DashboardView(APIView):
    """Leads analytics for the landing dashboard (PRD §6).

    Scope follows lead visibility: a Lead Admin's numbers span every lead, a
    Lead Manager's / Marketing's their own — the §6 "own vs all leads-funnel"
    rows, resolved by :func:`analytics.scoped_lead_ids`. A user with no lead
    scope (a plain Employee, the Resource Manager) gets empty lead sections and
    a populated ``my_work``, which is always their own.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(analytics.leads_dashboard(request.user))


class ResourceDashboardView(APIView):
    """Resource-module analytics — Resource Manager only (PRD §5.7 / §6)."""

    permission_classes = [ResourceManagerPermission]

    def get(self, request):
        return Response(analytics.resources_dashboard(request.user))


class FinanceDashboardView(APIView):
    """Accounts-module analytics — Finance only (PRD §5.10 / §6)."""

    permission_classes = [FinancePermission]

    def get(self, request):
        return Response(analytics.finance_dashboard(request.user))
