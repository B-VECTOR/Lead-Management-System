from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Task

# Role group names (seeded by authentication.seed_lookups). Kept here as the
# lead domain's view of the roles it cares about, rather than importing the
# management-command module.
LEAD_ADMIN = "lead_admin"
LEAD_MANAGER = "lead_manager"
MARKETING = "marketing"
RESOURCE_MANAGER = "resource_manager"
EMPLOYEE = "employee"


def in_group(user, name):
    """True if ``user`` belongs to the group ``name`` (roles are M2M groups)."""
    return user.groups.filter(name=name).exists()


def user_role_names(user):
    """The set of the caller's group names — one query, reused across checks."""
    return set(user.groups.values_list("name", flat=True))


class CanAssignOwnerPermission(BasePermission):
    """Read access to the assignable-owners list.

    Only Lead Managers and Lead Admins ever set a lead's owner (Marketing's
    owner field is hidden), so only they need this lookup.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user_role_names(user) & {LEAD_MANAGER, LEAD_ADMIN})


def can_view_task(user, task):
    """Task visibility (Tech Req §6 rules 2–3 + §12 view rows).

    Lead Admin sees every task; a user always sees a task assigned to them; a
    Lead Manager sees tasks under leads they created or own; and the lead's
    owner gets view-only access to a task assigned to someone else.
    """
    if not user or not user.is_authenticated:
        return False
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return True
    if task.assigned_to_id == user.id:
        return True
    lead = task.lead
    if LEAD_MANAGER in roles and user.id in (lead.created_by_id, lead.assigned_to_id):
        return True
    # Lead owner keeps view-only access even without the Lead Manager role.
    return lead.assigned_to_id == user.id


def can_edit_task(user, task):
    """Editable only by the assigned user, and only while open (§6 rules 2, 4)."""
    if not user or not user.is_authenticated:
        return False
    return task.status == Task.Status.OPEN and task.assigned_to_id == user.id


def can_reassign_task(user, task):
    """Who may reassign a task.

    The docs say "any task can be reassigned" from within the task view but do
    not name the actor; this build allows the current assignee (handing it off)
    and Lead Admin. Only meaningful while the task is open.
    """
    if not user or not user.is_authenticated:
        return False
    if task.status != Task.Status.OPEN:
        return False
    return task.assigned_to_id == user.id or LEAD_ADMIN in user_role_names(user)


def can_hold_lead(user, lead):
    """Who may hold/unhold a lead (Tech Req §6 / PRD §5.8).

    The docs require the action but don't name the actor; this build allows the
    lead's owner, its Lead-Manager creator, and any Lead Admin — the same people
    who steer the lead. (Marketing, which only sources leads, is excluded.)
    """
    if not user or not user.is_authenticated:
        return False
    roles = user_role_names(user)
    if LEAD_ADMIN in roles:
        return True
    if lead.assigned_to_id == user.id:
        return True
    return LEAD_MANAGER in roles and user.id in (lead.created_by_id, lead.assigned_to_id)


def can_hold_task(user, task):
    """Who may hold/unhold a single task: its assignee, the lead owner, or a
    Lead Admin (mirrors the reassign actor set, Tech Req §6).
    """
    if not user or not user.is_authenticated:
        return False
    if task.assigned_to_id == user.id:
        return True
    if task.lead.assigned_to_id == user.id:
        return True
    return LEAD_ADMIN in user_role_names(user)


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
    """Read access to the follow-up assignee list — Lead Manager only, since
    they are the only role that raises follow-ups (§12 "Add follow-up task").
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return LEAD_MANAGER in user_role_names(user)


class FollowupPermission(BasePermission):
    """Server-side enforcement of the PRD §6 / Tech Req §12 follow-up rows.

    - **Create** ("Add follow-up task") — Lead Manager only.
    - **View** — role-scoped by the view's queryset (assignee / creator, or all
      for Lead Admin); object-level SAFE access is granted here since the
      queryset already narrows it.
    - **Update / comment** — :func:`can_edit_followup` (creator, assignee, or
      Lead Admin).
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method == "POST":
            return LEAD_MANAGER in user_role_names(user)
        return True

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
            return bool(roles & {LEAD_ADMIN, LEAD_MANAGER, MARKETING})
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
