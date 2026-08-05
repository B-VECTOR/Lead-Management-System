from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Lead, ResourceAllocation, Task

# Role group names (seeded by authentication.seed_lookups). Kept here as the
# lead domain's view of the roles it cares about, rather than importing the
# management-command module.
LEAD_ADMIN = "lead_admin"
LEAD_MANAGER = "lead_manager"
MARKETING = "marketing"
RESOURCE_MANAGER = "resource_manager"
FINANCE = "finance"
EMPLOYEE = "employee"
# Exclusive back-office role: its holders manage users (via Django admin) and
# never take part in the lead/task/resource workflow, so they must not appear
# in user listings or any assignment/resource people-picker.
USER_MANAGEMENT = "user_management"


def exclude_user_management(qs):
    """Drop User Management holders from a people-selection queryset.

    A single home for the "UM users are never selectable/listed" rule so every
    dropdown and listing filters them out the same way. Uses ``exclude`` (a
    subquery), so it adds no duplicate rows.
    """
    return qs.exclude(groups__name=USER_MANAGEMENT)


def in_group(user, name):
    """True if ``user`` belongs to the group ``name`` (roles are M2M groups)."""
    return user.groups.filter(name=name).exists()


def user_role_names(user):
    """The set of the caller's group names — one query, reused across checks."""
    return set(user.groups.values_list("name", flat=True))


class CanAssignOwnerPermission(BasePermission):
    """Read access to the assignable-owners list.

    Only Lead Managers and Lead Admins ever set a lead's *owner* (Marketing's
    owner field is hidden) — but the same list is the task-reassignment people-
    picker, and since R21 reassignment belongs to the lead's custodians, one of
    whom is its owner *whatever their role* (a Default BD Person may be a plain
    Employee). So a user who currently owns a lead may read it too; without that
    they would get a Reassign control with an empty dropdown.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user_role_names(user) & {LEAD_MANAGER, LEAD_ADMIN}:
            return True
        return Lead.objects.filter(assigned_to=user).exists()


def is_execution_red(user, lead):
    """True if ``user`` has ever been allocated as ``lead``'s Execution Red (R9).

    Any Red row counts, not only a currently-``allocated`` one: the Red is
    mandatory and continuous across stages (D11 releases the row when a stage
    closes, which must not revoke their access mid-lead). Per the user: "who can
    see all the steps once red is assigned — he can also see all the steps."
    """
    if not user or not user.is_authenticated:
        return False
    return ResourceAllocation.objects.filter(
        lead=lead, slot=ResourceAllocation.Slot.EXECUTION_RED, user=user,
    ).exists()


def can_view_task(user, task):
    """Task visibility (Tech Req §6 rules 2–3 + §12 view rows).

    Lead Admin sees every task; a user always sees a task assigned to them; a
    Lead Manager sees tasks under leads they created or own; the lead's owner —
    and, since R9, the lead's **Execution Red** — get view access to every step.
    *(The Phase-13 allocation-people view rule was rescinded per PRD v3 / Tech
    Req v16 — Phase 14a, 2026-07-16; R9 reinstates it for the Execution Red
    alone, whose engagement-long ownership the docs' §7.5 already assumes.)*
    """
    if not user or not user.is_authenticated:
        return False
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return True
    if task.assigned_to_id == user.id:
        return True
    # Finance sees (and works — see can_edit_task) the payment-approval gate
    # tasks 7/15/28, which open unassigned (§5.10 / §12).
    if task.is_finance_gate and FINANCE in roles:
        return True
    # The Resource Manager sees (and staffs — see can_work_allocation_task) the
    # allocation tasks 3/10/17/18/24/25, which also open unassigned (§4.7).
    # Without this the lead they can already open (see views.lead_scope_q) would
    # render an empty task stepper, leaving the allocation step reachable only
    # from the Resources queue.
    if task.is_allocation_task and RESOURCE_MANAGER in roles:
        return True
    lead = task.lead
    if LEAD_MANAGER in roles and user.id in (lead.created_by_id, lead.assigned_to_id):
        return True
    if lead.assigned_to_id == user.id:
        return True
    return is_execution_red(user, lead)


def can_edit_task(user, task):
    """Editable while open by its assignee only (§6 rules 2, 4), with Lead Admin
    retained as an administrative override (Phase 11, per the user).

    Execution tasks open assigned to the allocated **Execution Red** (§7.5), so
    the Red edits them. *(The Phase-13 Brown/White co-editor rule was rescinded
    per PRD v3 / Tech Req v16 — Phase 14a, 2026-07-16.)* A self-assigned Lead
    Manager edits because they are the assignee.
    """
    if not user or not user.is_authenticated:
        return False
    if task.status != Task.Status.OPEN:
        return False
    if task.assigned_to_id == user.id:
        return True
    roles = user_role_names(user)
    # Finance works the payment-approval gates (7/15/28) — answering "Payment
    # received?" Yes/No — even though they open unassigned (§5.10 / §12).
    if task.is_finance_gate and FINANCE in roles:
        return True
    return LEAD_ADMIN in roles


def is_lead_custodian(user, lead):
    """Who stands behind a lead for its whole life (R21).

    The **Lead Manager who created it**, its **current owner** (``assigned_to``
    — any role, since the Default BD Person may be a plain Employee), or a Lead
    Admin. Custodianship does not depend on who a given task is assigned to, so
    delegating work never gives it away.

    A **Marketing** creator is deliberately excluded (DD-R21-2): Marketing only
    sources leads — a Marketing-sourced lead has no tasks until a Lead Admin
    assigns an owner — and :func:`can_hold_lead` already keeps them out of the
    lead's workflow controls for the same reason.
    """
    if not user or not user.is_authenticated:
        return False
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return True
    if lead.assigned_to_id == user.id:
        return True
    return LEAD_MANAGER in roles and lead.created_by_id == user.id


def can_reassign_task(user, task):
    """Who may hand a task to somebody else: the lead's custodians only
    (:func:`is_lead_custodian`), while the task is open.

    **R21 (per the user):** this used to alias :func:`can_edit_task`, which made
    reassignment a *transferable* right — whoever a task was handed to could hand
    it on again, while the lead's creator/owner lost the lever entirely. Being
    given a task is now no longer grounds for giving it away: the Execution Red
    (and any other assignee) works and holds their task, and the person who
    created or owns the lead decides where it goes. An assignee who is also a
    custodian — the usual case, since tasks open on the lead's owner — still
    reassigns, as themselves rather than as the assignee.

    Finance's incidental rights over the payment gates 7/15/28 are dropped here
    (DD-R21-3): a gate opens unassigned and is worked from the Accounts queue by
    role, so it is nobody's to reassign. Working it (:func:`can_edit_task`) is
    unaffected.
    """
    if not user or not user.is_authenticated:
        return False
    if task.status != Task.Status.OPEN:
        return False
    return is_lead_custodian(user, task.lead)


def can_hold_lead(user, lead):
    """Who may hold/unhold (and reassign) a lead — Lead Manager (+ Lead Admin).

    Phase 11 (per the user): only the managing Lead Manager holds the lead; the
    plain-employee assignee can no longer hold a lead (only their own task). An
    LM who *created* or was *assigned* the lead qualifies (so a self-assigned LM
    works), and Lead Admin overrides. Marketing, which only sources leads, is
    excluded.
    """
    if not user or not user.is_authenticated:
        return False
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return True
    return LEAD_MANAGER in roles and user.id in (lead.created_by_id, lead.assigned_to_id)


def can_drop_lead(user, lead):
    """Who may drop (cancel) a lead — the same actors who could previously set
    ``status = Dropped`` via a plain edit: the managing Lead Manager / Lead
    Admin (:func:`can_hold_lead`) plus a Marketing creator, who may edit every
    field of the leads they sourced (PRD §5.2).
    """
    if can_hold_lead(user, lead):
        return True
    return MARKETING in user_role_names(user) and lead.created_by_id == user.id


def can_hold_task(user, task):
    """Who may hold/unhold a single task: its assignee, or one of the lead's
    custodians (:func:`is_lead_custodian`, which covers Lead Admin).

    Phase 11 (per the user): the person actively working a task holds/resumes it
    — the one who knows it is blocked. **R21** adds the lead's custodians, so the
    creator/owner can still pause work they delegated: unlike reassignment, hold
    is a right the assignee *shares* rather than takes over. The Execution Red
    keeps it on their own tasks as an assignee (explicitly asked for), while
    :func:`can_reassign_task` denies them the hand-on.
    """
    if not user or not user.is_authenticated:
        return False
    if task.assigned_to_id == user.id:
        return True
    return is_lead_custodian(user, task.lead)


class TaskPermission(BasePermission):
    """Object-level task access — view via :func:`can_view_task`, write (the
    Save-as-Draft PATCH) via :func:`can_edit_task`. Custom actions (complete,
    reassign) do their own checks in the view.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_view_task(request.user, obj)
        return can_edit_task(request.user, obj)


class ResourceManagerPermission(BasePermission):
    """Resource-allocation + Project-Closure access — Resource Manager only.

    PRD §6 / Tech Req §12: "View / add / edit resource allocation" is a Yes only
    for the Resource Manager; every other role is No. These screens (allocation
    list/edit + submit, project-closure list + short-close) are owned entirely
    by that role (Finance is future scope, §5.10).
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return RESOURCE_MANAGER in user_role_names(user)


def can_work_allocation_task(user, task):
    """Who may allocate/reassign/release/submit an allocation task's slots
    (D12, Tech Req §4.7 / PRD §5.7): the Resource Manager, or the lead's
    Default BD Person (``lead.assigned_to``) — either may complete it.

    **R12-5 — the Resource Manager keeps the slots editable after the task
    closes.** Staffing isn't a one-shot form: the allocation stays live until its
    rows are released (D11), and swapping a person mid-engagement is the Resource
    Manager's standing privilege (it cascades onto the Red's tasks — see
    ``resources.reassign``). The Default BD Person's D12 rights stay limited to a
    task still in play, and a ``skipped``/``dropped`` task is nobody's to staff.
    """
    if not user or not user.is_authenticated:
        return False
    if task.status in (Task.Status.SKIPPED, Task.Status.DROPPED):
        return False
    if RESOURCE_MANAGER in user_role_names(user):
        return True
    if task.status not in (Task.Status.OPEN, Task.Status.PENDING, Task.Status.HOLD):
        return False
    return task.lead.assigned_to_id == user.id


class AllocationActionPermission(BasePermission):
    """Object-level gate for the allocation slot-action endpoints (allocate /
    reassign / release / submit) and the allocation user-picker (D12).

    The view must implement ``get_task()`` returning the :class:`Task` the
    action targets (or ``None``), since the permission depends on *that
    lead's* owner, not a blanket role check.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        task = view.get_task()
        if task is None:
            # The user-picker endpoint carries no task — role alone decides.
            return RESOURCE_MANAGER in user_role_names(user)
        return can_work_allocation_task(user, task)


class FinancePermission(BasePermission):
    """Accounts-queue access — Finance role only (PRD §6 / Tech Req §12).

    Gates the Finance screen (the queue of payment-approval gate tasks 7/15/28).
    Working an individual gate is additionally allowed by :func:`can_edit_task`;
    this class guards the list endpoint's role.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return FINANCE in user_role_names(user)


def can_view_followup(user, followup):
    """Follow-up visibility (Tech Req §8 / PRD §5.11; §12 view rows).

    Lead Admin sees every follow-up ("View all follow-up history", on Lead
    Detail); otherwise a user sees follow-ups assigned to them (the Employee /
    Lead-Manager-self "Other Tasks" view) or that they raised (``created_by``).
    """
    if not user or not user.is_authenticated:
        return False
    if LEAD_ADMIN in user_role_names(user):
        return True
    return user.id in (followup.assigned_to_id, followup.created_by_id)


def can_edit_followup(user, followup):
    """Who may update a follow-up (status / remark) or add a thread comment.

    The docs name only the Lead-Manager creator and the assignee as the follow-
    up's participants; this build lets either of them (plus a Lead Admin) update
    it and comment, so both the raiser and the person doing the work can drive
    it to done.
    """
    if not user or not user.is_authenticated:
        return False
    if LEAD_ADMIN in user_role_names(user):
        return True
    return user.id in (followup.assigned_to_id, followup.created_by_id)


class CanAddFollowupPermission(BasePermission):
    """Read access to the follow-up assignee list. Open to any authenticated
    user (Phase 12) — follow-up creation is no longer Lead-Manager-only, so any
    creator needs to load the assignee dropdown.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)


class FollowupPermission(BasePermission):
    """Server-side enforcement of the PRD §6 / Tech Req §12 follow-up rows.

    - **Create** — any authenticated user (Phase 12, per the user: the assigned
      Red / Resource Manager / anyone who can see the lead may raise follow-ups).
      The view additionally checks the *target lead* is one the caller can view
      (``user_can_view_lead``), so a user can only raise a follow-up on a lead
      they have access to.
    - **View** — role-scoped by the view's queryset (assignee / creator, or all
      for Lead Admin); object-level SAFE access is granted here since the
      queryset already narrows it.
    - **Update / comment** — :func:`can_edit_followup` (creator, assignee, or
      Lead Admin).
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return can_view_followup(request.user, obj)
        return can_edit_followup(request.user, obj)


class LeadPermission(BasePermission):
    """Server-side enforcement of the PRD §6 / Tech Req §12 lead matrix.

    - **Marketing** may create leads (owner forced to "Not Assigned") and
      view/edit the leads they created — never the ``assigned_to`` field.
    - **Lead Manager** may create leads with an owner and view/edit their own
      leads (created by, or assigned to, them).
    - **Lead Admin** may view every lead and assign an owner to a still-
      unassigned (Marketing-sourced) lead — that assignment starts the workflow.

    Object-level write access is decided here; list/retrieve scoping is done by
    the view's queryset (:meth:`LeadListCreateView.get_queryset`).
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        roles = user_role_names(user)
        if request.method in SAFE_METHODS:
            # Read access is decided by the view's role-scoped queryset — a plain
            # Employee may open the lead(s) assigned to them (to work their tasks)
            # and sees nothing else.
            return True
        if request.method == "POST":
            return bool(roles & {LEAD_MANAGER, MARKETING})
        # PUT/PATCH — object-level check does the real work.
        return bool(roles & {LEAD_ADMIN, LEAD_MANAGER, MARKETING})

    def has_object_permission(self, request, view, obj):
        user = request.user
        if request.method in SAFE_METHODS:
            return True  # queryset is already role-scoped
        roles = user_role_names(user)
        # Lead Manager: edit leads they created or that are assigned to them.
        if LEAD_MANAGER in roles and user.id in (obj.created_by_id, obj.assigned_to_id):
            return True
        # Marketing: edit the leads they created (field-level guard on
        # assigned_to lives in the serializer).
        if MARKETING in roles and obj.created_by_id == user.id:
            return True
        # Lead Admin: may only touch a still-unassigned lead (to assign owner).
        if LEAD_ADMIN in roles and obj.assigned_to_id is None:
            return True
        return False
