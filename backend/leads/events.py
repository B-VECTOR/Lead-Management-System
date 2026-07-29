"""Activity-log + notification helpers (Phase 8, PRD §6 / Decision #4).

Small, side-effect-only functions the API/service layer calls when a
notable event happens. They are deliberately best-effort and additive — the
lead/task/follow-up flows work whether or not these fire — so wiring them in
does not change existing behaviour or the workflow engine.
"""

from django.contrib.auth import get_user_model

from . import projects
from .models import ActivityLog, Notification

# The Finance role group name (seeded by authentication.seed_lookups). Kept as a
# literal here to avoid importing the permissions module for one constant,
# mirroring resources.RESOURCE_MANAGER_GROUP.
FINANCE_GROUP = "finance"


def log_activity(lead, actor, type, summary, body=""):
    """Record one auto-logged event on ``lead`` (NFR §7 — attributable + timestamped).

    R9-1: stamps the lead's Project ID at the time of the event so the log is
    readable by project straight from the DB (display snapshot only, DD-R9-2).
    """
    return ActivityLog.objects.create(
        lead=lead,
        project_id=projects.row_project_id(lead),
        actor=actor,
        type=type,
        summary=summary,
        body=body or "",
    )


def notify(user, type, message, link=""):
    """Create one in-app notification for ``user`` (skipped if ``user`` is None)."""
    if user is None:
        return None
    return Notification.objects.create(
        user=user, type=type, message=message, link=link or ""
    )


def lead_link(lead):
    """Frontend route for a lead — used as a notification's deep link."""
    return f"/leads/{lead.id}"


def notify_finance(lead, type, message, link=None):
    """Notify every active Finance user of a payment-approval event (R4, §5.10).

    Finance gate tasks open unassigned (worked from the Accounts queue), so no
    single assignee is notified by the normal task-open path — alert all Finance
    holders instead. Best-effort/additive, like resources._notify_resource_managers.
    """
    User = get_user_model()
    link = link if link is not None else lead_link(lead)
    managers = User.objects.filter(
        groups__name=FINANCE_GROUP, is_active=True
    ).distinct()
    for user in managers:
        notify(user, type, message, link)
