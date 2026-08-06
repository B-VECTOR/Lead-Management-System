"""Server-side filtering for the leads list (R25).

Every filter the leads table offers is applied **in the database, to the whole
role-scoped queryset**, before the page slice is taken. The alternative — the
frontend filtering whatever rows the current page happened to contain — silently
hides matches the moment the data outgrows one page, which is the failure this
module exists to prevent.

Two of the columns the table filters on are *derived* facts rather than stored
ones, so they cannot be filtered with a plain ``.filter()``:

- **Current stage** — :func:`projects.current_stage` prefers the most recently
  started ``in_progress`` stage and falls back to the most recent stage of any
  status (a lead can have parallel Mining ∥ Extension stages, §13).
- **Current task** — :meth:`serializers.LeadSerializer.get_current_task` takes
  the lowest ``(task_no, id)`` among the ``open``/``hold`` tasks.

:data:`CURRENT_STAGE_CODE` and :data:`CURRENT_TASK_NO` are the ORM twins of those
two functions, **with the same tie-breaks**. Both the filters and the dropdown
option lists (:func:`filter_options`) read the annotations, so a dropdown can
never offer a value the rendered column disagrees with. If either Python
function's tie-break changes, its twin here has to change with it.
"""

from django.db.models import IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce

from .models import Lead, LeadStage, Task

# --- the derived columns, as annotations ------------------------------------

# The most recently started *open* stage; ``stage_start_dt`` is non-null
# (``default=timezone.now``), so no null ordering to reconcile.
_OPEN_STAGE = Subquery(
    LeadStage.objects.filter(
        lead=OuterRef("pk"), status=LeadStage.Status.IN_PROGRESS
    )
    .order_by("-stage_start_dt", "-id")
    .values("stage")[:1]
)
_LATEST_STAGE = Subquery(
    LeadStage.objects.filter(lead=OuterRef("pk"))
    .order_by("-stage_start_dt", "-id")
    .values("stage")[:1]
)
#: The stage code the lead's Project-ID suffix and Current-Stage column show.
CURRENT_STAGE_CODE = Coalesce(_OPEN_STAGE, _LATEST_STAGE)

#: The task number the Current-Task column shows (``None`` when nothing is live).
CURRENT_TASK_NO = Subquery(
    Task.objects.filter(
        lead=OuterRef("pk"), status__in=[Task.Status.OPEN, Task.Status.HOLD]
    )
    .order_by("task_no", "id")
    .values("task_no")[:1],
    output_field=IntegerField(),
)

#: Sentinel the owner filter uses for "no owner yet" — the Owner column renders
#: those rows as "Not Assigned", so the dropdown has to be able to ask for them.
UNASSIGNED = "unassigned"


def annotate_list_columns(qs):
    """Add the derived columns the list filters/sorts on.

    Kept separate from :func:`filter_leads` because the option lists need the
    same annotations on an *unfiltered* queryset.
    """
    return qs.annotate(
        current_stage_code=CURRENT_STAGE_CODE,
        current_task_no=CURRENT_TASK_NO,
    )


# --- the filters -------------------------------------------------------------


def _text(params, key):
    return (params.get(key) or "").strip()


def _int(params, key):
    raw = _text(params, key)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def filter_leads(qs, params):
    """Apply the leads-list query params to ``qs`` (already role-scoped).

    All filters combine with **AND** (§5.18). A blank, absent or unparseable
    param is ignored rather than rejected: this backs a per-column filter row,
    not a form, and a 400 there would strand the screen on a stray character.
    """
    qs = annotate_list_columns(qs)

    # Free text over the two identity columns the header search sits above.
    q = _text(params, "q")
    if q:
        qs = qs.filter(Q(company_name__icontains=q) | Q(project_name__icontains=q))

    # Project ID: the stable base (``IN-PHNPDCFF26001``) *or* a stage snapshot
    # (``…-IM``), so a search that includes the suffix the column displays still
    # matches. The derived display ID is never stored on the lead (§13), which
    # is why the stage rows are searched too.
    project_id = _text(params, "project_id")
    if project_id:
        qs = qs.filter(
            Q(base_code__icontains=project_id)
            | Q(stages__project_id__icontains=project_id)
        )

    industry = _int(params, "industry")
    if industry is not None:
        qs = qs.filter(industry_id=industry)

    domain = _int(params, "domain")
    if domain is not None:
        qs = qs.filter(domain_id=domain)

    owner = _text(params, "owner")
    if owner == UNASSIGNED:
        qs = qs.filter(assigned_to__isnull=True)
    elif owner:
        owner_id = _int(params, "owner")
        if owner_id is not None:
            qs = qs.filter(assigned_to_id=owner_id)

    stage = _text(params, "stage")
    if stage:
        qs = qs.filter(current_stage_code=stage)

    task_no = _int(params, "task_no")
    if task_no is not None:
        qs = qs.filter(current_task_no=task_no)

    status = _text(params, "status")
    if status in Lead.Status.values:
        qs = qs.filter(status=status)

    lead_type = _text(params, "lead_type")
    if lead_type in Lead.LeadType.values:
        qs = qs.filter(lead_type=lead_type)

    # `distinct()` because both the role scope (`lead_scope_q` joins tasks /
    # allocations) and the Project-ID search (joins stages) can multiply rows.
    return qs.distinct()


# --- the dropdown option lists ----------------------------------------------


def filter_options(qs):
    """Distinct filter values over the **whole** scoped queryset (R25-4).

    Deliberately computed on the unfiltered set, not on the current page and not
    narrowed by the other active filters: the point of the screen is that a value
    can be found across all pages, so the option has to be offered even when no
    row currently on screen carries it. Options are still limited to values that
    exist *somewhere* in what this user may see — an empty dropdown entry that
    can only ever return nothing is worse than a shorter list.
    """
    def distinct_derived(expr, alias):
        """DISTINCT over one derived column, evaluated in the database.

        Annotating *one* expression and selecting only it lets Postgres dedupe
        (``SELECT DISTINCT <subquery> FROM lead``) and hand back the handful of
        values that exist. Annotating both at once would make the DISTINCT span
        the pair and stream one row per lead into Python — fine at 200 leads,
        not at 200,000.
        """
        rows = qs.annotate(**{alias: expr}).values(alias).distinct()
        return {row[alias] for row in rows if row[alias] not in (None, "")}

    def named(field):
        rows = (
            qs.filter(**{f"{field}__isnull": False})
            .values_list(f"{field}_id", f"{field}__name")
            .distinct()
        )
        return [
            {"value": pk, "label": name}
            for pk, name in sorted(set(rows), key=lambda r: (r[1] or "").lower())
        ]

    owners = (
        qs.filter(assigned_to__isnull=False)
        .values_list("assigned_to_id", "assigned_to__name")
        .distinct()
    )
    stages = distinct_derived(CURRENT_STAGE_CODE, "current_stage_code")
    task_nos = distinct_derived(CURRENT_TASK_NO, "current_task_no")
    # A task number's name comes from the workflow JSON and is stable across
    # instances, so any row carrying that number supplies the label.
    names = {}
    for no, name in Task.objects.filter(task_no__in=task_nos).values_list(
        "task_no", "task_name"
    ):
        names.setdefault(no, name)
    present_statuses = set(qs.values_list("status", flat=True).distinct())
    present_types = set(qs.values_list("lead_type", flat=True).distinct())

    return {
        "industries": named("industry"),
        "domains": named("domain"),
        "owners": [
            {"value": pk, "label": name}
            for pk, name in sorted(set(owners), key=lambda r: (r[1] or "").lower())
        ],
        "has_unassigned": qs.filter(assigned_to__isnull=True).exists(),
        # Stage codes sorted with the fixed codes in workflow order and the
        # dynamic Extension loops (E1, E2, …) after them, numerically.
        "stages": sorted(stages, key=_stage_sort_key),
        "current_tasks": [
            {"value": no, "label": names.get(no, f"Task {no}")}
            for no in sorted(task_nos)
        ],
        # Choice-ordered, not alphabetical — "In Progress → Hold → Dropped →
        # Completed" is the order the business reads these in.
        "statuses": [s for s in Lead.Status.values if s in present_statuses],
        "lead_types": [t for t in Lead.LeadType.values if t in present_types],
    }


_STAGE_ORDER = [
    LeadStage.BD,
    LeadStage.TWO_HR,
    LeadStage.SNT,
    LeadStage.IM,
    LeadStage.MINING,
    LeadStage.CLOSURE,
]


def _stage_sort_key(code):
    if code in _STAGE_ORDER:
        return (0, _STAGE_ORDER.index(code), 0)
    # Extension loops: E1, E2, … sort after the fixed codes, numerically.
    if code.startswith("E") and code[1:].isdigit():
        return (1, int(code[1:]), 0)
    return (2, 0, code)
