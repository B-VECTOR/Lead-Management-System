"""Project ID generation + the project_details history (Tech Req §13 / PRD §5.15).

Format (§13):

    {CountryCode}-{IndustryCode}{AreaCode}{YY}{SeqNo}-I{ExtensionValue}
    e.g.  IN-PHNPD26001-I00

The country/industry/area/year/sequence portion (``project_id_base``) is
**locked in at Task 12** — computed once from the lead's field values then and
reused as-is on every Task-16 regeneration, even if the lead's industry/area/
country are later edited (§13.1). Only the ``-I{extension}`` suffix changes when
Task 16 closes.

Codes are read from the linked reference rows (``country.code`` etc.), never
hardcoded (§5.17). The full history of every Project ID a lead has held lives in
``ProjectDetails`` (§4.8); ``leads.project_id`` only ever holds the current one.
"""

from django.db import transaction
from django.utils import timezone

from .models import ProjectDetails


def _sequence_number(year):
    """Next 3-digit sequence for ``year``.

    **Interpretation (documented; §13 leaves the sequence scope unstated):** a
    single incrementing counter per 2-digit year, shared across all countries/
    industries/areas — matching the source-sheet examples, where ``…26001`` and
    ``…26002`` increment across *different* industries within the same year. It
    is the count of first-time (``extension_no="00"``) Project IDs already
    generated in that calendar year, plus one.
    """
    count = ProjectDetails.objects.filter(
        extension_no="00", generated_at__year=year
    ).count()
    return count + 1


def build_project_id_base(lead, *, when=None):
    """Compute the locked base ``{CC}-{IC}{AC}{YY}{Seq}`` for ``lead`` (§13.1)."""
    when = when or timezone.now()
    yy = f"{when.year % 100:02d}"
    seq = f"{_sequence_number(when.year):03d}"
    return f"{lead.country.code}-{lead.industry.code}{lead.domain.code}{yy}{seq}"


def compose_project_id(base, extension):
    """Full Project ID for a base + a 2-digit extension value (§13)."""
    return f"{base}-I{extension}"


@transaction.atomic
def generate_first_project_id(lead, user, *, allocation=None, when=None):
    """Task 12 closure: first-time Project ID + the initial project_details row.

    Sets ``leads.extension`` to ``"00"``, locks ``project_id_base``, stores the
    full ``project_id`` on the lead, and inserts the ``extension_no="00"``
    history row (``is_current=True``) linked to the Implementation allocation.
    Idempotent — if the lead already has a base, it is not recomputed.
    """
    when = when or timezone.now()
    if not lead.project_id_base:
        lead.project_id_base = build_project_id_base(lead, when=when)
    lead.extension = "00"
    lead.project_id = compose_project_id(lead.project_id_base, lead.extension)
    lead.save(update_fields=["project_id_base", "project_id", "extension", "updated_at"])
    return ProjectDetails.objects.create(
        lead=lead,
        resource_allocation=allocation,
        extension_no="00",
        project_id=lead.project_id,
        project_id_base=lead.project_id_base,
        status=ProjectDetails.Status.IN_PROGRESS,
        is_current=True,
        generated_at=when,
        generated_by=user,
    )


@transaction.atomic
def regenerate_project_id(lead, user, *, allocation=None, when=None):
    """Task 16 closure: bump the extension, regenerate the ID, cycle the history.

    Increments ``leads.extension`` (``00``→``01``→…), rebuilds ``project_id``
    from the *locked* base + new suffix, flips the previous current
    ``project_details`` row to ``Extended``/``is_current=False``, and inserts a
    new current row for the new extension linked to this cycle's Extension
    allocation.
    """
    when = when or timezone.now()
    next_ext = f"{int(lead.extension or '0') + 1:02d}"
    lead.extension = next_ext
    lead.project_id = compose_project_id(lead.project_id_base, next_ext)
    lead.save(update_fields=["project_id", "extension", "updated_at"])

    ProjectDetails.objects.filter(lead=lead, is_current=True).update(
        status=ProjectDetails.Status.EXTENDED, is_current=False
    )
    return ProjectDetails.objects.create(
        lead=lead,
        resource_allocation=allocation,
        extension_no=next_ext,
        project_id=lead.project_id,
        project_id_base=lead.project_id_base,
        status=ProjectDetails.Status.IN_PROGRESS,
        is_current=True,
        generated_at=when,
        generated_by=user,
    )


def complete_current_cycle(lead):
    """Task 17 closure: mark the current project_details cycle Complete (§4.8).

    A short-closed cycle keeps its terminal **Short Closed** status instead of
    flipping to Complete (Phase 16 follow-up). Earlier (``Extended``) rows are
    left untouched either way.
    """
    current = ProjectDetails.objects.filter(lead=lead, is_current=True)
    status = (
        ProjectDetails.Status.SHORT_CLOSED
        if current.filter(short_closed=True).exists()
        else ProjectDetails.Status.COMPLETE
    )
    current.update(status=status)
