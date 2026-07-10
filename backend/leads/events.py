"""Activity-log + notification helpers (Phase 8, PRD §6 / Decision #4).

Small, side-effect-only functions the API/service layer calls when a
notable event happens. They are deliberately best-effort and additive — the
lead/task/follow-up flows work whether or not these fire — so wiring them in
does not change existing behaviour or the workflow engine.
"""

from .models import ActivityLog, Notification


def log_activity(lead, actor, type, summary, body=""):
    """Record one auto-logged event on ``lead`` (NFR §7 — attributable + timestamped)."""
    return ActivityLog.objects.create(
        lead=lead, actor=actor, type=type, summary=summary, body=body or ""
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
