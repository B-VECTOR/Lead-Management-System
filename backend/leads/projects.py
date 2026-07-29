"""Project ID generation, stage lifecycle helpers, and the project_details
commercial history (Tech Req §4.4, §4.8, §13 / PRD §5.3, §5.15, §9.2).

The Project ID is a stable ``base_code`` generated once at lead creation plus a
**derived** stage suffix — never a stored join key (§13). The displayed string
appends the current open stage's code
(``-BD``/``-2HR``/``-SnT``/``-IM``/``-E{n}``/``-M``), resolved live from the
lead's ``lead_stage`` rows so parallel Mining ∥ Extension stages are
represented correctly.

Base composition — **finalized by the user 2026-07-28** (§13, D1 amended),
superseding the interim ``{AreaCode}{YY}{Seq}``::

    IN  -  PH        NPD    CFF     26     001        -IM
    │      │         │      │       │      │          └─ stage of intervention
    │      │         │      │       │      └─ sequence, one counter per year
    │      │         │      │       └─ 2-digit year
    │      │         │      └─ type of project (Lead.TYPE_OF_PROJECT_CODES)
    │      │         └─ area code (the lead's single domain, per D2)
    │      └─ industry code
    └─ country code

The four classification codes are read from the lead's own FKs/choice value at
creation and then **frozen** — editing the lead's country/industry/domain/type
afterwards deliberately does *not* rewrite the ID, which is already printed on
every stage, task, allocation and activity row (decision 2026-07-28).

R6 adds: the dynamic extension-loop stage (``ensure_extension_stage``, ``E0 →
E1 → …``), spawning a Mining child lead off Task 21 (``spawn_mining_lead``),
and recording a ``project_details`` commercial snapshot per closed IM/E{n}
cycle (``record_project_cycle`` — TR §4.8).
"""

import re

from django.db import transaction
from django.utils import timezone

from .models import Lead, LeadStage, ProjectDetails


def _initial_stage_code(lead):
    """The stage a freshly-created lead enters (§4.4).

    Extension-type leads (decision D10) enter at the first extension loop
    ``E0``; Mining leads open a ``M`` cycle; everything else starts in ``BD``.
    """
    if lead.lead_type == Lead.LeadType.EXTENSION:
        return "E0"
    if lead.lead_type == Lead.LeadType.MINING:
        return LeadStage.MINING
    return LeadStage.BD


def type_of_project_code(lead):
    """The lead's Type-of-Project segment for the Project ID (§13.4).

    ``""`` for a lead with no type recorded — the serializer requires one on
    create, so this only degrades gracefully for legacy/fixture rows rather
    than blocking ID generation.
    """
    return Lead.TYPE_OF_PROJECT_CODES.get(lead.type_of_project, "")


# The Year+Sequence tail of a base_code. Everything before it is letters (the
# four classification codes), so the trailing digit run is always exactly
# ``YY`` + the sequence.
_TAIL_DIGITS = re.compile(r"(\d+)$")


def next_base_sequence(*, year):
    """Next 3-digit sequence for a 2-digit year (§13.1).

    The sequence scope is **one counter per year, globally** (decision
    2026-07-28) — not per Area as it was before the Project ID gained the
    country/industry/type segments. So the digits alone identify the project
    within its year. ``distinct()`` matters because a Mining child reuses its
    parent's ``base_code`` (§13) — a shared base must not consume a number twice.
    """
    yy = f"{year % 100:02d}"
    codes = (
        Lead.objects.exclude(base_code__isnull=True)
        .exclude(base_code="")
        .values_list("base_code", flat=True)
        .distinct()
    )
    max_seq = 0
    for code in codes:
        match = _TAIL_DIGITS.search(code)
        if match is None:
            continue
        digits = match.group(1)
        # Skip other years (and anything too short to carry YY + a sequence).
        if len(digits) <= 2 or not digits.startswith(yy):
            continue
        max_seq = max(max_seq, int(digits[2:]))
    return max_seq + 1


def build_base_code(lead, *, when=None):
    """Compose the stable base for ``lead`` (§13, format finalized 2026-07-28).

    ``{CountryCode}-{IndustryCode}{AreaCode}{TypeCode}{YY}{Seq}`` — e.g.
    ``IN-PHNPDCFF26001``. The single domain (D2) supplies the Area code; the
    sequence is global per year.
    """
    when = when or timezone.now()
    yy = f"{when.year % 100:02d}"
    seq = f"{next_base_sequence(year=when.year):03d}"
    core = f"{lead.industry.code}{lead.domain.code}{type_of_project_code(lead)}{yy}{seq}"
    return f"{lead.country.code}-{core}"


@transaction.atomic
def assign_base_code(lead, *, when=None):
    """Generate + persist ``lead.base_code`` if it does not already have one.

    Called at lead creation. Idempotent — a lead that already carries a base
    (e.g. a future Mining child that copied its parent's, R6) is left untouched.
    Returns the base_code.
    """
    if lead.base_code:
        return lead.base_code
    lead.base_code = build_base_code(lead, when=when)
    lead.save(update_fields=["base_code", "updated_at"])
    return lead.base_code


def project_id_for_stage(lead, stage_code):
    """The display Project ID **snapshot** for one specific ``stage_code`` (§13).

    Unlike :func:`derived_project_id` — which picks the lead's *current* open
    stage — this composes the ID for the stage code passed in, so each
    ``lead_stage`` row can store its own stable value (``IN-PHNPDCFF26001-IM``,
    ``…-E0``, a Mining lead's ``…-M`` / ``…-M-E0``).
    Returns ``""`` until ``base_code`` exists. Display only, never a join key.
    """
    if not lead.base_code:
        return ""
    if lead.lead_type == Lead.LeadType.MINING:
        return lead.base_code + "-M" + (f"-{stage_code}" if stage_code != LeadStage.MINING else "")
    return f"{lead.base_code}-{stage_code}"


@transaction.atomic
def ensure_stage(lead, stage_code, *, when=None):
    """Get-or-open an ``in_progress`` stage of ``stage_code`` for ``lead``.

    Idempotent: returns the existing open stage of that code if one exists,
    otherwise opens a new one. R2 uses it to open the initial stage at creation;
    R3's engine reuses it as each task opens (so the initial stage is not
    duplicated). The stored ``project_id`` snapshot is stamped on creation.
    """
    existing = lead.stages.filter(
        stage=stage_code, status=LeadStage.Status.IN_PROGRESS
    ).first()
    if existing is not None:
        return existing
    return LeadStage.objects.create(
        lead=lead,
        stage=stage_code,
        project_id=project_id_for_stage(lead, stage_code),
        status=LeadStage.Status.IN_PROGRESS,
        stage_start_dt=when or timezone.now(),
    )


def open_initial_stage(lead, *, when=None):
    """Open the lead's first stage at creation (§4.4)."""
    return ensure_stage(lead, _initial_stage_code(lead), when=when)


def stable_project_id(lead):
    """The lead-level **stable** Project ID stored on ``lead.project_id`` (meeting
    decision 2026-07-27): the ``base_code`` plus a ``-M`` marker for a Mining
    lead — and **no** stage suffix, so it stays constant for the lead's life
    (``IN-PHNPDCFF26001``, ``IN-PHNPDCFF26002-M``). The stage-suffixed variants
    live per-row on ``lead_stage``/``task_details``
    (:func:`project_id_for_stage`). ``""`` until ``base_code`` exists."""
    if not lead.base_code:
        return ""
    if lead.lead_type == Lead.LeadType.MINING:
        return f"{lead.base_code}-M"
    return lead.base_code


def initialize_new_lead(lead, *, when=None):
    """R2 lead-creation hook: allocate ``base_code``, stamp the stable
    ``project_id``, and open the initial stage."""
    assign_base_code(lead, when=when)
    stable = stable_project_id(lead)
    if lead.project_id != stable:
        lead.project_id = stable
        lead.save(update_fields=["project_id", "updated_at"])
    open_initial_stage(lead, when=when)


# --- R6: dynamic extension-loop stage + mining spawn + project_details -------


def extension_stage_count(lead):
    """How many extension-loop stages (any status) this lead has ever opened —
    the next one is ``E{count}`` (§4.3.1/TR row 26: ``E0 → E1 → …``)."""
    return lead.stages.filter(stage__regex=r"^E\d+$").count()


def current_extension_stage(lead):
    """The lead's currently **open** extension-loop stage, or ``None``."""
    return (
        lead.stages.filter(stage__regex=r"^E\d+$", status=LeadStage.Status.IN_PROGRESS)
        .order_by("-stage_start_dt", "-id")
        .first()
    )


def ensure_extension_stage(lead, *, when=None):
    """Get-or-open the lead's current extension-loop stage (R6).

    Unlike :func:`ensure_stage`, the code is resolved dynamically rather than
    passed in: reuse the currently **open** ``E{n}`` stage if there is one
    (Tasks 23–26 continuing the loop Task 22 just opened/reused), otherwise
    open the **next** one (``E{count}`` — Task 22 starting a new loop, whether
    the lead's very first entry or a loop-back after Task 26 closed and closed
    its own stage). Idempotent within one open loop pass.
    """
    current = current_extension_stage(lead)
    if current is not None:
        return current
    stage_code = f"E{extension_stage_count(lead)}"
    return LeadStage.objects.create(
        lead=lead,
        stage=stage_code,
        project_id=project_id_for_stage(lead, stage_code),
        status=LeadStage.Status.IN_PROGRESS,
        stage_start_dt=when or timezone.now(),
    )


@transaction.atomic
def spawn_mining_lead(parent, user, *, when=None):
    """Task 21 "go-ahead = Yes" (PRD §5.3.1, §13; TR row 21): spawn a fresh
    Mining lead off ``parent``.

    Shares the parent's ``base_code`` (so both Project IDs read as the same
    engagement, distinguished by the ``-M`` marker, §13) and is linked back via
    ``parent_lead``. Copies the parent's classification/ownership so the child
    can start a fresh BD cycle from Task 1 immediately — it opens its own ``M``
    stage (via :func:`initialize_new_lead`) that runs independently until its
    own 2HR study starts, in parallel with any open Extension on the parent.
    """
    # ``assigned_to`` is set *after* ``initialize_new_lead`` below, not at
    # creation — assigning an owner at creation fires the workflow-start signal
    # (leads/signals.py) synchronously inside this ``create()`` call, which
    # would open Task 1 (stage ``BD``) *before* the child's own initial ``M``
    # stage exists. ``LeadStage.current_stage``'s tie-break prefers whichever
    # stage started last, so that ordering would leave the derived Project ID
    # stuck on the fresh, taskless ``M`` marker instead of tracking the child's
    # real BD→2HR→SnT→IM progress. Deferring the assignment lets ``M`` open
    # first, so ``BD`` (opened moments later when Task 1 opens) correctly
    # outranks it.
    child = Lead.objects.create(
        base_code=parent.base_code,
        parent_lead=parent,
        company_name=parent.company_name,
        project_name=parent.project_name,
        country=parent.country,
        industry=parent.industry,
        domain=parent.domain,
        division=parent.division,
        scope=parent.scope,
        lead_type=Lead.LeadType.MINING,
        flow_of_tasks=parent.flow_of_tasks or Lead.FlowOfTasks.DEFAULT,
        type_of_project=parent.type_of_project,
        status=Lead.Status.IN_PROGRESS,
        created_by=user,
    )
    initialize_new_lead(child, when=when)
    child.assigned_to = parent.assigned_to
    child.save(update_fields=["assigned_to", "updated_at"])
    return child


def record_project_cycle(lead, stage, user, *, fixed_fee=None, variable_fee=None, when=None):
    """Insert one ``project_details`` commercial-history row (§4.8) for a cycle
    that just closed (Task 20 → stage ``IM``; Task 26 → stage ``E{n}``).

    An immutable snapshot: the derived Project ID at generation time plus the
    closing task's headline fixed/variable fee fields (``0`` if blank/missing —
    the ≥0 global rule already validated them at task closure).
    """
    return ProjectDetails.objects.create(
        lead=lead,
        stage=stage,
        project_id=derived_project_id(lead),
        project=stage.stage if stage is not None else "",
        fixed_fee=fixed_fee or 0,
        variable_fee=variable_fee or 0,
        generated_at=when or timezone.now(),
        generated_by=user,
    )


def close_stage(stage):
    """Mark ``stage`` closed (idempotent, no-op if already closed/absent) — the
    generic stage-close step (R6) used for the extension-loop stage on Task 26
    closure and for sweeping engagement stages on short-close, mirroring what
    :func:`engine._reconcile_stages` does for the main-sequence stages."""
    if stage is None or stage.status == LeadStage.Status.CLOSED:
        return
    stage.status = LeadStage.Status.CLOSED
    stage.stage_end_dt = timezone.now()
    stage.save(update_fields=["status", "stage_end_dt", "updated_at"])


def current_stage(lead):
    """The stage row that drives the display suffix (§13).

    Prefers the most-recently-started **open** stage (so a lead advancing to a
    new stage shows the new suffix); falls back to the most recent stage of any
    status, then ``None``. A single stored suffix cannot represent parallel
    Mining ∥ Extension stages, which is why this is derived per request.
    """
    stages = list(lead.stages.all())  # uses the prefetch cache when prefetched
    if not stages:
        return None
    open_stages = [s for s in stages if s.status == LeadStage.Status.IN_PROGRESS]
    pool = open_stages or stages
    return max(pool, key=lambda s: (s.stage_start_dt or timezone.now(), s.id))


def derived_project_id(lead):
    """The stage-legible display Project ID — derived, never stored (§13).

    ``base_code [+ "-M"] + "-" + {current_stage_code}``. A Mining lead carries a
    ``-M`` marker (its ``M`` cycle shows just ``-M``; a mining cycle that extends
    shows ``-M-E{n}``). Returns ``""`` when the base has not been generated yet
    so callers can render a "pending" placeholder.
    """
    if not lead.base_code:
        return ""
    stage = current_stage(lead)
    code = stage.stage if stage is not None else _initial_stage_code(lead)
    return project_id_for_stage(lead, code)


def row_project_id(lead, stage=None):
    """The ``project_id`` snapshot to stamp on a new lead-scoped row (R9-1).

    One home for the choice (DD-R9-2): a row that belongs to a specific stage
    reuses **that stage's** stored snapshot; a purely lead-scoped row (a hold, a
    follow-up, an attachment, an activity entry) takes the lead's *live* derived
    ID at insert time, so the suffix records which stage the row happened during.
    Display only — never a join key (§13).
    """
    if stage is not None:
        return stage.project_id or project_id_for_stage(lead, stage.stage)
    return derived_project_id(lead)


