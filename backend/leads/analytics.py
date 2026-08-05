"""Dashboard aggregation (Phase R20).

One home for every number the role dashboards draw. The views in :mod:`views`
own the permission gate and the request/response shape; this module owns the
queries.

Three rules hold throughout:

- **Scope is never re-invented here.** Lead-facing aggregates run against the
  ids returned by :func:`scoped_lead_ids`, which is :func:`views.lead_scope_q`
  materialized — so a Lead Manager's dashboard covers exactly the leads their
  list covers, and a Lead Admin's covers everything (PRD §6).
- **Ids first, then aggregate.** ``lead_scope_q`` joins tasks and allocation
  rows, so counting straight off the scoped queryset inflates every bucket by
  the number of joined children (the bug ``DashboardView`` fixed with
  ``distinct=True``). Resolving the scope to a flat id list once removes the
  whole class of error, and the row counts here are internal-tool sized.
- **No metric the schema can't back.** There is no deal value on a lead and no
  planned release date on an allocation, so there is no pipeline-value or
  upcoming-releases section (DD-R20-3). Money exists only on
  ``project_details``, recognized when a cycle closes.
"""

from collections import OrderedDict
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, IntegerField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from . import engine, projects, resources
from .models import (
    Followup,
    Lead,
    LeadHold,
    LeadStage,
    ProjectDetails,
    ResourceAllocation,
    Task,
)
from .permissions import LEAD_ADMIN, USER_MANAGEMENT, user_role_names

User = get_user_model()

# How long an active lead may go with no task closing before the dashboard
# calls it stalled. A workflow step that has not moved in a fortnight is the
# thing a manager wants surfaced; shorter than that is just normal work.
STALLED_AFTER_DAYS = 14

# Buckets for "how long has this been sitting", in days. The last bucket is
# open-ended (``None`` upper bound).
AGE_BUCKETS = (
    ("0–30 days", 0, 30),
    ("31–60 days", 31, 60),
    ("61–90 days", 61, 90),
    ("90+ days", 91, None),
)

# The BD→closure spine, in order, for the funnel. Extension loops (``E1``,
# ``E2``, …) collapse into one "Extension" step — the funnel asks "did the lead
# get this far", and a third extension is not a fourth kind of progress.
FUNNEL_STEPS = (
    ("BD", "BD"),
    ("2HR", "2HR"),
    ("SnT", "SnT"),
    ("IM", "Implementation"),
    ("E", "Extension"),
    ("M", "Mining"),
    ("Closure", "Closure"),
)

MONTHS_OF_HISTORY = 6

# Cap on the rows in a breakdown chart; the tail folds into one "Other" row
# rather than growing the category count without limit.
BREAKDOWN_LIMIT = 8


# --- shared helpers ---------------------------------------------------------


MONTH_LABELS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)


def _month_key(value):
    return value.strftime("%Y-%m") if value else None


def _month_series(months=MONTHS_OF_HISTORY, *, today=None):
    """The last ``months`` months as ``{key: {month, label, ...}}``, oldest first.

    Pre-seeded so a month with no activity still renders as a zero column
    instead of vanishing and making the trend look denser than it is.
    """
    today = today or timezone.localdate()
    out = OrderedDict()
    year, month = today.year, today.month
    for offset in range(months - 1, -1, -1):
        m = month - offset
        y = year
        while m <= 0:
            m += 12
            y -= 1
        key = f"{y:04d}-{m:02d}"
        out[key] = {"month": key, "label": f"{MONTH_LABELS[m - 1]} {y % 100:02d}"}
    return out


def _series_start(series):
    """The first instant covered by a ``_month_series`` window — the ``__gte``
    bound every trend query filters on."""
    first = next(iter(series), None)
    if first is None:
        return timezone.now()
    naive = datetime.strptime(first, "%Y-%m")
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive


def _bucket_age(days):
    for label, low, high in AGE_BUCKETS:
        if days >= low and (high is None or days <= high):
            return label
    return AGE_BUCKETS[-1][0]


def _empty_age_buckets():
    return OrderedDict((label, 0) for label, _, _ in AGE_BUCKETS)


def _days_since(value, *, now=None):
    if value is None:
        return None
    now = now or timezone.now()
    return max(0, int((now - value).total_seconds() // 86400))


def _fold_breakdown(pairs, *, limit=BREAKDOWN_LIMIT):
    """``[(label, count), …]`` sorted desc, with the tail folded into "Other"."""
    rows = sorted(
        ({"label": label or "—", "count": count} for label, count in pairs),
        key=lambda r: (-r["count"], r["label"]),
    )
    if len(rows) <= limit:
        return rows
    head, tail = rows[: limit - 1], rows[limit - 1 :]
    head.append({"label": "Other", "count": sum(r["count"] for r in tail)})
    return head


def _rate(part, whole):
    """Percentage, rounded to one place; ``None`` when there is nothing to divide
    (an empty dashboard should read "—", not "0%")."""
    return round(part / whole * 100, 1) if whole else None


def scoped_lead_ids(user):
    """Every lead id ``user`` may see, as a flat list — :func:`views.lead_scope_q`
    resolved once so the aggregates below can filter on ``lead_id__in``."""
    from .views import lead_scope_q  # local: views imports this module

    qs = Lead.objects.all()
    q = lead_scope_q(user)
    if q is not None:
        qs = qs.filter(q)
    return list(qs.values_list("id", flat=True).distinct())


# --- leads module -----------------------------------------------------------


def _lead_totals(leads, counts):
    completed = counts.get(Lead.Status.COMPLETE, 0)
    dropped = counts.get(Lead.Status.DROPPED, 0)
    on_hold = counts.get(Lead.Status.ON_HOLD, 0)
    decided = completed + dropped
    total = leads.count()
    cycle = leads.filter(
        status=Lead.Status.COMPLETE, lead_end_dt__isnull=False
    ).values_list("lead_start_dt", "lead_end_dt")
    spans = [(end - start).total_seconds() / 86400 for start, end in cycle]
    return {
        "total": total,
        "in_progress": counts.get(Lead.Status.IN_PROGRESS, 0),
        "on_hold": on_hold,
        "completed": completed,
        "dropped": dropped,
        # Of the leads that reached an outcome — an in-flight lead is not a
        # loss, so counting it in the denominator would understate every book
        # that is simply young.
        "conversion_rate": _rate(completed, decided),
        "decided": decided,
        # The leakage figure: leads written off or frozen, over the *whole*
        # book. Deliberately not over ``decided`` — a hold is not an outcome,
        # so the only denominator it belongs in is every lead in scope.
        "drop_hold": dropped + on_hold,
        "drop_hold_rate": _rate(dropped + on_hold, total),
        "avg_cycle_days": round(sum(spans) / len(spans), 1) if spans else None,
        "unassigned": leads.filter(assigned_to__isnull=True).count(),
    }


def _lead_funnel(lead_ids):
    """How many leads ever *reached* each stage, plus the drop-off between
    consecutive steps. Built from ``lead_stage`` rows of any status: a closed
    stage still counts as reached."""
    reached = {code: set() for code, _ in FUNNEL_STEPS}
    rows = LeadStage.objects.filter(lead_id__in=lead_ids).values_list(
        "stage", "lead_id"
    )
    for stage, lead_id in rows:
        if stage in reached:
            reached[stage].add(lead_id)
        elif stage and stage.startswith("E") and stage[1:].isdigit():
            reached["E"].add(lead_id)
    out = []
    previous = None
    for code, label in FUNNEL_STEPS:
        count = len(reached[code])
        out.append(
            {
                "code": code,
                "label": label,
                "count": count,
                # Share of the *previous* step that made it here — the number a
                # funnel is actually read for.
                "from_previous": _rate(count, previous) if previous else None,
            }
        )
        previous = count
    return out


def _lead_trend(leads):
    series = _month_series()
    for row in series.values():
        row.update(created=0, completed=0, dropped=0)
    oldest = _series_start(series)

    created = (
        leads.filter(lead_start_dt__gte=oldest)
        .annotate(m=TruncMonth("lead_start_dt"))
        .values("m")
        .annotate(n=Count("id"))
    )
    for row in created:
        key = _month_key(row["m"])
        if key in series:
            series[key]["created"] = row["n"]

    ended = (
        leads.filter(lead_end_dt__gte=oldest, lead_end_dt__isnull=False)
        .annotate(m=TruncMonth("lead_end_dt"))
        .values("m", "status")
        .annotate(n=Count("id"))
    )
    for row in ended:
        key = _month_key(row["m"])
        if key not in series:
            continue
        if row["status"] == Lead.Status.COMPLETE:
            series[key]["completed"] += row["n"]
        elif row["status"] == Lead.Status.DROPPED:
            series[key]["dropped"] += row["n"]
    return list(series.values())


def _lead_aging(leads, now):
    buckets = _empty_age_buckets()
    active = leads.filter(
        status__in=[Lead.Status.IN_PROGRESS, Lead.Status.ON_HOLD]
    ).values_list("lead_start_dt", flat=True)
    for start in active:
        buckets[_bucket_age(_days_since(start, now=now) or 0)] += 1
    return [{"label": label, "count": count} for label, count in buckets.items()]


def _lead_breakdowns(leads):
    def by(field, label_field=None):
        rows = (
            leads.values(label_field or field)
            .annotate(n=Count("id"))
            .values_list(label_field or field, "n")
        )
        return _fold_breakdown(rows)

    return {
        "industry": by("industry", "industry__name"),
        "domain": by("domain", "domain__name"),
        "type_of_project": by("type_of_project"),
        "lead_type": by("lead_type"),
    }


def _lead_owners(leads):
    """Per-owner rollup — the Lead Admin's "view all leads-funnel" row (§6)."""
    rows = (
        leads.filter(assigned_to__isnull=False)
        .values("assigned_to", "assigned_to__name")
        .annotate(
            total=Count("id"),
            in_progress=Count("id", filter=Q(status=Lead.Status.IN_PROGRESS)),
            on_hold=Count("id", filter=Q(status=Lead.Status.ON_HOLD)),
            completed=Count("id", filter=Q(status=Lead.Status.COMPLETE)),
            dropped=Count("id", filter=Q(status=Lead.Status.DROPPED)),
        )
        .order_by("-total")
    )
    out = []
    for row in rows:
        decided = row["completed"] + row["dropped"]
        out.append(
            {
                "id": row["assigned_to"],
                "name": row["assigned_to__name"],
                "total": row["total"],
                "in_progress": row["in_progress"],
                "on_hold": row["on_hold"],
                "completed": row["completed"],
                "dropped": row["dropped"],
                "conversion_rate": _rate(row["completed"], decided),
                "drop_hold": row["dropped"] + row["on_hold"],
                "drop_hold_rate": _rate(
                    row["dropped"] + row["on_hold"], row["total"]
                ),
            }
        )
    return out


def _lead_card(lead, *, progress=None):
    """The compact lead shape every dashboard list uses."""
    card = {
        "id": lead.id,
        "company_name": lead.company_name,
        "project_name": lead.project_name,
        "status": lead.status,
        "lead_type": lead.lead_type,
        "project_id_display": projects.derived_project_id(lead),
        "owner": lead.assigned_to.name if lead.assigned_to_id else None,
    }
    if progress is not None:
        card["progress"] = progress
    return card


def _task_progress(lead):
    tasks = [t for t in lead.tasks.all() if t.status != Task.Status.SKIPPED]
    if not tasks:
        return 0
    closed = sum(1 for t in tasks if t.status == Task.Status.CLOSED)
    return round(closed / len(tasks) * 100)


def _lead_attention(leads, lead_ids, user, now):
    """Everything asking for a decision: overdue follow-ups, long-held leads,
    stalled workflows, and leads still without an owner."""
    today = timezone.localdate()

    overdue = (
        Followup.objects.filter(
            assigned_to=user,
            status=Followup.Status.OPEN,
            followup_date__lt=today,
        )
        .select_related("lead")
        .order_by("followup_date")[:20]
    )
    overdue_followups = [
        {
            "id": f.id,
            "lead": f.lead_id,
            "title": f.title,
            "followup_date": f.followup_date,
            "days_overdue": (today - f.followup_date).days,
            "company_name": f.lead.company_name,
        }
        for f in overdue
    ]

    holds = (
        LeadHold.objects.filter(lead_id__in=lead_ids, unhold_at__isnull=True)
        .select_related("lead", "lead__assigned_to")
        .order_by("hold_at")[:20]
    )
    held_leads = [
        {
            **_lead_card(h.lead),
            "held_since": h.hold_at,
            "days_held": _days_since(h.hold_at, now=now),
            "reason": h.reason,
        }
        for h in holds
    ]

    # Stalled: in progress, but nothing has closed in a fortnight. A lead whose
    # workflow never started at all counts once it is itself that old, which is
    # the case worth chasing (nobody has picked it up).
    cutoff = now - timedelta(days=STALLED_AFTER_DAYS)
    stalled_qs = (
        leads.filter(status=Lead.Status.IN_PROGRESS)
        .annotate(
            last_close=Max(
                "tasks__task_end_dt", filter=Q(tasks__status=Task.Status.CLOSED)
            )
        )
        .filter(Q(last_close__lt=cutoff) | Q(last_close__isnull=True, lead_start_dt__lt=cutoff))
        .select_related("assigned_to")
        .prefetch_related("tasks", "stages")
        .order_by("lead_start_dt")[:20]
    )
    stalled = []
    for lead in stalled_qs:
        last = lead.last_close or lead.lead_start_dt
        stalled.append(
            {
                **_lead_card(lead, progress=_task_progress(lead)),
                "idle_days": _days_since(last, now=now),
                "last_activity": last,
            }
        )

    unassigned_qs = (
        leads.filter(assigned_to__isnull=True)
        .exclude(status__in=[Lead.Status.COMPLETE, Lead.Status.DROPPED])
        .prefetch_related("stages")
        .order_by("lead_start_dt")[:20]
    )
    unassigned = [
        {
            **_lead_card(lead),
            "waiting_days": _days_since(lead.lead_start_dt, now=now),
        }
        for lead in unassigned_qs
    ]

    return {
        "overdue_followups": overdue_followups,
        "held_leads": held_leads,
        "stalled": stalled,
        "unassigned": unassigned,
    }


def my_work(user, now=None):
    """The section every user gets, whatever else they hold: their own open
    tasks, follow-ups and allocations. For a plain Employee this *is* their
    dashboard — the old build handed them a leads funnel that is always empty.
    """
    now = now or timezone.now()
    today = timezone.localdate()

    tasks = (
        Task.objects.filter(assigned_to=user)
        .exclude(status__in=[Task.Status.SKIPPED, Task.Status.DROPPED])
        .select_related("lead", "stage")
        .order_by("status", "task_start_dt", "id")
    )
    open_tasks, held_tasks = [], []
    closed_count = 0
    for task in tasks:
        if task.status == Task.Status.CLOSED:
            closed_count += 1
            continue
        row = {
            "id": task.id,
            "lead": task.lead_id,
            "task_no": task.task_no,
            "task_name": task.task_name,
            "status": task.status,
            "company_name": task.lead.company_name,
            "project_name": task.lead.project_name,
            "project_id": task.project_id,
            "stage": task.stage.stage if task.stage_id else None,
            "opened_at": task.task_start_dt,
            "age_days": _days_since(task.task_start_dt, now=now),
            "is_finance_gate": task.is_finance_gate,
            "is_allocation_task": task.is_allocation_task,
        }
        (held_tasks if task.status == Task.Status.HOLD else open_tasks).append(row)

    followups = (
        Followup.objects.filter(assigned_to=user, status=Followup.Status.OPEN)
        .select_related("lead")
        .order_by("followup_date")
    )
    followup_rows = [
        {
            "id": f.id,
            "lead": f.lead_id,
            "title": f.title,
            "followup_date": f.followup_date,
            "company_name": f.lead.company_name,
            "days_overdue": (today - f.followup_date).days,
        }
        for f in followups
    ]

    allocations = (
        ResourceAllocation.objects.filter(
            user=user, status=ResourceAllocation.Status.ALLOCATED
        )
        .select_related("lead", "stage")
        .order_by("-allocated_on")
    )
    allocation_rows = [
        {
            "id": a.id,
            "lead": a.lead_id,
            "slot": a.slot,
            "project_id": a.project_id,
            "company_name": a.lead.company_name,
            "project_name": a.lead.project_name,
            "stage": a.stage.stage if a.stage_id else None,
            "allocated_on": a.allocated_on,
            "days_worked": round(
                (now - a.allocated_on).total_seconds() / 86400, 1
            ),
        }
        for a in allocations
    ]
    total_days = sum(
        ((released or now) - allocated).total_seconds() / 86400
        for allocated, released in ResourceAllocation.objects.filter(
            user=user
        ).values_list("allocated_on", "released_on")
    )

    return {
        "totals": {
            "open_tasks": len(open_tasks),
            "held_tasks": len(held_tasks),
            "closed_tasks": closed_count,
            "open_followups": len(followup_rows),
            "overdue_followups": sum(1 for f in followup_rows if f["days_overdue"] > 0),
            "due_today": sum(1 for f in followup_rows if f["days_overdue"] == 0),
            "current_allocations": len(allocation_rows),
            "days_worked": round(total_days, 1),
        },
        "open_tasks": open_tasks,
        "held_tasks": held_tasks,
        "followups": followup_rows[:20],
        "allocations": allocation_rows,
    }


def leads_dashboard(user):
    """Everything the leads-facing dashboard draws, scoped per PRD §6."""
    now = timezone.now()
    lead_ids = scoped_lead_ids(user)
    leads = Lead.objects.filter(id__in=lead_ids)
    is_admin = LEAD_ADMIN in user_role_names(user)

    counts = dict(
        leads.values_list("status").annotate(n=Count("id")).values_list("status", "n")
    )
    count_by_status = [
        {"status": value, "count": counts.get(value, 0)} for value in Lead.Status.values
    ]

    active_qs = (
        leads.filter(status__in=[Lead.Status.IN_PROGRESS, Lead.Status.ON_HOLD])
        .select_related("assigned_to")
        .prefetch_related("tasks", "stages")
    )
    active_leads = [
        _lead_card(lead, progress=_task_progress(lead)) for lead in active_qs
    ]

    attention = _lead_attention(leads, lead_ids, user, now)

    return {
        "scope": "all" if is_admin else "own",
        "generated_at": now,
        # --- back-compat keys (the pre-R20 dashboard payload) ---------------
        "total_leads": len(lead_ids),
        "active_lead_count": len(active_leads),
        "completed_count": counts.get(Lead.Status.COMPLETE, 0),
        "dropped_count": counts.get(Lead.Status.DROPPED, 0),
        "count_by_status": count_by_status,
        "active_leads": active_leads,
        "overdue_followups": attention["overdue_followups"],
        # --- R20 analytics --------------------------------------------------
        "totals": _lead_totals(leads, counts),
        "funnel": _lead_funnel(lead_ids),
        "trend": _lead_trend(leads),
        "aging": _lead_aging(leads, now),
        "breakdowns": _lead_breakdowns(leads),
        "owners": _lead_owners(leads) if is_admin else [],
        "attention": attention,
        "my_work": my_work(user, now=now),
    }


# --- resource module --------------------------------------------------------

# Slot families for the "who is staffed as what" breakdown — the 16 slot values
# collapse to the five roles the Resource Manager actually thinks in.
SLOT_FAMILIES = (
    ("Execution Red", (ResourceAllocation.Slot.EXECUTION_RED,)),
    ("Execution Brown", (ResourceAllocation.Slot.EXECUTION_BROWN,)),
    ("White", (ResourceAllocation.Slot.WHITE,)),
    ("Auditors", tuple(ResourceAllocation.AUDITOR_SLOTS)),
    ("Project members", tuple(ResourceAllocation.PROJECT_MEMBER_SLOTS)),
)


def _slot_family(slot):
    for label, slots in SLOT_FAMILIES:
        if slot in slots:
            return label
    return "Other"


def _allocation_rows():
    """Every allocation row that names a real person. Legacy TBD rows (R14-1)
    name nobody, so they would show up as a resource called "TBD"."""
    return ResourceAllocation.objects.filter(is_tbd=False)


def _allocation_fill(tasks):
    """Per open allocation task: how many of its required slots are filled.

    Requirements come from :func:`resources.slot_requirements` — the same
    function the allocation form's ``required`` figures come from — so the
    dashboard meter can never disagree with the screen it links to. Counted
    across *all* slots, not the viewer-visible subset: this is the Resource
    Manager's own dashboard, and they see every slot anyway.
    """
    defs = {}
    for lead_type in Lead.LeadType.values:
        defs.update(engine.task_defs_for(lead_type))

    filled_by_task = {}
    for task_id, n in (
        ResourceAllocation.objects.filter(
            task__in=tasks, status=ResourceAllocation.Status.ALLOCATED, is_tbd=False
        )
        .values_list("task_id")
        .annotate(n=Count("id"))
        .values_list("task_id", "n")
    ):
        filled_by_task[task_id] = n

    rows = []
    for task in tasks:
        tdef = defs.get(task.task_no)
        if not tdef or not tdef.get("is_allocation_task"):
            continue
        required = sum(resources.slot_requirements(task.lead, tdef).values())
        filled = filled_by_task.get(task.id, 0)
        rows.append(
            {
                "task": task.id,
                "lead": task.lead_id,
                "task_no": task.task_no,
                "task_name": task.task_name,
                "project_id": task.project_id,
                "company_name": task.lead.company_name,
                "project_name": task.lead.project_name,
                "status": task.status,
                "required": required,
                "filled": filled,
                "fill_rate": _rate(filled, required),
                "age_days": _days_since(task.task_start_dt),
            }
        )
    rows.sort(key=lambda r: (r["fill_rate"] if r["fill_rate"] is not None else 0, -(r["age_days"] or 0)))
    return rows


def resources_dashboard(user):
    """The Resource Manager's module: what is waiting, who is on what, and who
    is free (PRD §5.7 / §6)."""
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    open_tasks = list(
        Task.objects.filter(
            is_allocation_task=True,
            status__in=[Task.Status.OPEN, Task.Status.HOLD, Task.Status.PENDING],
        )
        .select_related("lead", "stage")
        .order_by("task_start_dt", "id")
    )
    fill = _allocation_fill(open_tasks)

    rows = _allocation_rows()
    allocated = rows.filter(status=ResourceAllocation.Status.ALLOCATED)

    by_slot_counts = {}
    for slot, n in allocated.values_list("slot").annotate(n=Count("id")).values_list(
        "slot", "n"
    ):
        by_slot_counts[_slot_family(slot)] = by_slot_counts.get(_slot_family(slot), 0) + n
    by_slot = [
        {"label": label, "count": by_slot_counts.get(label, 0)}
        for label, _ in SLOT_FAMILIES
    ]

    by_stage_counts = {}
    for stage, n in (
        allocated.filter(stage__isnull=False)
        .values_list("stage__stage")
        .annotate(n=Count("id"))
        .values_list("stage__stage", "n")
    ):
        by_stage_counts[stage] = n
    by_stage = _fold_breakdown(by_stage_counts.items())

    # Utilization, from the append-only history: days worked, what they are on
    # now, and how many engagements at once.
    people = {}
    for row in rows.select_related("user", "lead"):
        if row.user_id is None:
            continue
        person = people.setdefault(
            row.user_id,
            {
                "id": row.user_id,
                "name": row.names or (row.user.name if row.user_id else "—"),
                "days_worked": 0.0,
                "current": 0,
                "leads": set(),
                "current_leads": set(),
                "slots": set(),
            },
        )
        end = row.released_on or now
        person["days_worked"] += (end - row.allocated_on).total_seconds() / 86400
        person["leads"].add(row.lead_id)
        if row.status == ResourceAllocation.Status.ALLOCATED:
            person["current"] += 1
            person["current_leads"].add(row.lead_id)
            person["slots"].add(_slot_family(row.slot))
    utilization = sorted(
        (
            {
                "id": p["id"],
                "name": p["name"],
                "days_worked": round(p["days_worked"], 1),
                "current_allocations": p["current"],
                "concurrent_projects": len(p["current_leads"]),
                "total_projects": len(p["leads"]),
                "slots": sorted(p["slots"]),
            }
            for p in people.values()
        ),
        key=lambda p: (-p["current_allocations"], -p["days_worked"]),
    )

    # Bench: belt-holders with nothing allocated right now. The allocatable pool
    # is the same one the people-picker draws from — belt-holding, active, not
    # User Management — so the bench and the picker can't disagree.
    busy_ids = set(
        allocated.filter(user__isnull=False).values_list("user_id", flat=True)
    )
    pool = (
        User.objects.filter(is_active=True, is_deleted=False, is_superuser=False)
        .exclude(groups__name=USER_MANAGEMENT)
        .filter(belt__isnull=False)
        .select_related("belt")
        .distinct()
    )
    bench_counts = {}
    for person in pool:
        belt = person.belt.name if person.belt_id else "No belt"
        entry = bench_counts.setdefault(belt, {"label": belt, "allocated": 0, "free": 0})
        if person.id in busy_ids:
            entry["allocated"] += 1
        else:
            entry["free"] += 1
    bench = sorted(bench_counts.values(), key=lambda r: (-(r["allocated"] + r["free"]), r["label"]))

    # Allocation churn per month — started vs released.
    series = _month_series()
    for row in series.values():
        row.update(allocated=0, released=0)
    for row in (
        rows.annotate(m=TruncMonth("allocated_on")).values("m").annotate(n=Count("id"))
    ):
        key = _month_key(row["m"])
        if key in series:
            series[key]["allocated"] = row["n"]
    for row in (
        rows.filter(released_on__isnull=False)
        .annotate(m=TruncMonth("released_on"))
        .values("m")
        .annotate(n=Count("id"))
    ):
        key = _month_key(row["m"])
        if key in series:
            series[key]["released"] = row["n"]

    required_total = sum(r["required"] for r in fill)
    filled_total = sum(r["filled"] for r in fill)

    return {
        "generated_at": now,
        "totals": {
            "open_tasks": len(open_tasks),
            "slots_required": required_total,
            "slots_filled": filled_total,
            "fill_rate": _rate(filled_total, required_total),
            "unfilled": max(0, required_total - filled_total),
            "people_allocated": len(busy_ids),
            "projects_staffed": allocated.values("lead_id").distinct().count(),
            "bench": sum(r["free"] for r in bench),
            "reassignments": rows.filter(replaces__isnull=False).count(),
            "released_this_month": rows.filter(released_on__gte=month_start).count(),
        },
        "fill": fill,
        "by_slot": by_slot,
        "by_stage": by_stage,
        "utilization": utilization,
        "bench": bench,
        "trend": list(series.values()),
    }


# --- finance module ---------------------------------------------------------

def _finance_gate_defs():
    """``{gate_task_no: {"label", "source"}}`` read out of the workflow JSON.

    Which task numbers are gates, what they are called, and which money task a
    "No" sends back (``reopen_on_no``) are all workflow **data** — the same rule
    the engine follows (no task numbers in code). Ordered by task number, which
    is the order the three gates occur in.
    """
    defs = {}
    for lead_type in Lead.LeadType.values:
        for task_no, tdef in engine.task_defs_for(lead_type).items():
            if tdef.get("is_finance_gate"):
                defs.setdefault(
                    task_no,
                    {
                        "label": tdef.get("name") or tdef.get("task_name") or f"Task {task_no}",
                        "source": tdef.get("reopen_on_no"),
                    },
                )
    return OrderedDict(sorted(defs.items()))


def finance_dashboard(user):
    """The Accounts module: what is waiting, what keeps bouncing, and what has
    been recognized (PRD §5.10)."""
    now = timezone.now()
    gate_defs = _finance_gate_defs()
    gates = Task.objects.filter(is_finance_gate=True).select_related("lead")

    open_gates = list(
        gates.filter(status=Task.Status.OPEN).order_by("task_start_dt", "id")
    )
    closed_gates = gates.filter(status=Task.Status.CLOSED)

    def gate_label(task):
        entry = gate_defs.get(task.task_no)
        return entry["label"] if entry else task.task_name

    queue = [
        {
            "id": g.id,
            "lead": g.lead_id,
            "task_no": g.task_no,
            "task_name": g.task_name,
            "gate": gate_label(g),
            "project_id": g.project_id,
            "company_name": g.lead.company_name,
            "project_name": g.lead.project_name,
            # How many times this gate has already come back round — i.e. how
            # many completed chase cycles it has been through.
            "reopened_count": g.reopened_count,
            "opened_at": g.task_start_dt,
            "age_days": _days_since(g.task_start_dt, now=now),
        }
        for g in open_gates
    ]

    # A bounce is a "No" answer, and a "No" increments ``reopened_count`` on the
    # **money task** the gate sent back (``reopen_on_no``), not on the gate. The
    # gate's own counter only moves later, when that task closes again and the
    # gate re-opens — so counting both would tally every cycle twice.
    source_nos = [d["source"] for d in gate_defs.values() if d["source"] is not None]
    sent_back = Task.objects.filter(
        task_no__in=source_nos, reopened_count__gt=0
    ).select_related("lead")

    by_gate = []
    for task_no, entry in gate_defs.items():
        source = entry["source"]
        by_gate.append(
            {
                "task_no": task_no,
                "label": entry["label"],
                "open": sum(1 for g in queue if g["task_no"] == task_no),
                "cleared": closed_gates.filter(task_no=task_no).count(),
                "bounced": sum(
                    t.reopened_count for t in sent_back if t.task_no == source
                ),
            }
        )

    aging = _empty_age_buckets()
    for gate in queue:
        aging[_bucket_age(gate["age_days"] or 0)] += 1

    # The money that is genuinely stuck: tasks a gate sent back for chasing,
    # worst first.
    gate_by_source = {
        d["source"]: (no, d["label"]) for no, d in gate_defs.items() if d["source"]
    }
    bounces = [
        {
            "id": t.id,
            "lead": t.lead_id,
            "task_no": t.task_no,
            "task_name": t.task_name,
            "gate": gate_by_source.get(t.task_no, (None, "—"))[1],
            "gate_task_no": gate_by_source.get(t.task_no, (None, "—"))[0],
            "project_id": t.project_id,
            "company_name": t.lead.company_name,
            "project_name": t.lead.project_name,
            "reopened_count": t.reopened_count,
            "status": t.status,
        }
        for t in sent_back.order_by("-reopened_count", "id")[:20]
    ]

    # Time from a gate opening to closing, over the gates that have cleared.
    spans = [
        (end - start).total_seconds() / 86400
        for start, end in closed_gates.filter(
            task_start_dt__isnull=False, task_end_dt__isnull=False
        ).values_list("task_start_dt", "task_end_dt")
    ]

    # Money: the only figures the model holds are the per-cycle fees snapshotted
    # when an implementation/extension cycle closes (DD-R20-3).
    cycles = ProjectDetails.objects.select_related("lead")
    money = cycles.aggregate(
        fixed=Coalesce(Sum("fixed_fee"), Value(0), output_field=DecimalField()),
        variable=Coalesce(Sum("variable_fee"), Value(0), output_field=DecimalField()),
    )
    series = _month_series()
    for row in series.values():
        row.update(fixed=0.0, variable=0.0, cycles=0)
    for row in (
        cycles.annotate(m=TruncMonth("generated_at"))
        .values("m")
        .annotate(
            fixed=Coalesce(Sum("fixed_fee"), Value(0), output_field=DecimalField()),
            variable=Coalesce(Sum("variable_fee"), Value(0), output_field=DecimalField()),
            n=Count("id"),
        )
    ):
        key = _month_key(row["m"])
        if key in series:
            series[key]["fixed"] = float(row["fixed"])
            series[key]["variable"] = float(row["variable"])
            series[key]["cycles"] = row["n"]

    by_cycle = {}
    for project, fixed, variable in cycles.values_list(
        "project", "fixed_fee", "variable_fee"
    ):
        label = project or "—"
        entry = by_cycle.setdefault(label, {"label": label, "value": 0.0, "count": 0})
        entry["value"] += float(fixed) + float(variable)
        entry["count"] += 1

    return {
        "generated_at": now,
        "totals": {
            "open_gates": len(queue),
            "bounced_open": sum(1 for g in queue if g["reopened_count"] > 0),
            "cleared": closed_gates.count(),
            # One per "No" answer ever given (see the bounce note above).
            "reopens": sent_back.aggregate(
                n=Coalesce(Sum("reopened_count"), Value(0), output_field=IntegerField())
            )["n"],
            "chasing": sent_back.filter(status=Task.Status.OPEN).count(),
            "avg_clear_days": round(sum(spans) / len(spans), 1) if spans else None,
            "oldest_open_days": max((g["age_days"] or 0 for g in queue), default=0),
            "recognized_fixed": float(money["fixed"]),
            "recognized_variable": float(money["variable"]),
            "recognized_total": float(money["fixed"]) + float(money["variable"]),
            "cycles_closed": cycles.count(),
        },
        "queue": queue,
        "by_gate": by_gate,
        "aging": [{"label": label, "count": n} for label, n in aging.items()],
        "bounces": bounces,
        "revenue_trend": list(series.values()),
        "by_cycle": sorted(by_cycle.values(), key=lambda r: -r["value"]),
    }


# --- user-management module -------------------------------------------------

# Group name → the display label the app uses everywhere else. ``user_management``
# is absent deliberately: its holders are excluded from the population below, so
# a row for them would always read zero.
ROLE_LABELS = {
    "lead_admin": "Lead Admin",
    "lead_manager": "Lead Manager",
    "marketing": "Marketing",
    "resource_manager": "Resource Manager",
    "finance": "Finance",
    "employee": "Employee",
}


def users_dashboard():
    """The User Management module — the shape of the org, not of the pipeline.

    Population matches ``authentication.views._user_queryset`` exactly (no
    superusers, no User-Management holders), so every figure here agrees with
    the list screen it links to.
    """
    now = timezone.now()
    today = timezone.localdate()
    month_start = today.replace(day=1)

    everyone = User.all_objects.filter(is_superuser=False).exclude(
        groups__name=USER_MANAGEMENT
    )
    live = everyone.filter(is_deleted=False)

    by_role = []
    for group, label in ROLE_LABELS.items():
        by_role.append(
            {
                "label": label,
                "count": live.filter(groups__name=group).distinct().count(),
            }
        )
    by_role.sort(key=lambda r: -r["count"])

    by_belt = _fold_breakdown(
        live.values_list("belt__name")
        .annotate(n=Count("id"))
        .values_list("belt__name", "n"),
        limit=12,
    )
    by_domain = _fold_breakdown(
        live.values_list("domain__name")
        .annotate(n=Count("id"))
        .values_list("domain__name", "n"),
    )

    series = _month_series(12)
    for row in series.values():
        row["joined"] = 0
    for row in (
        live.annotate(m=TruncMonth("date_of_joining")).values("m").annotate(n=Count("id"))
    ):
        key = _month_key(row["m"])
        if key in series:
            series[key]["joined"] = row["n"]

    def card(u):
        return {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "employee_id": u.employee_id,
            "belt": u.belt.name if u.belt_id else None,
            "domain": u.domain.name if u.domain_id else None,
            "date_of_joining": u.date_of_joining,
            "is_active": u.is_active,
            # ``u.groups.all()`` (not ``values_list``) so the prefetch cache is
            # used — otherwise this is one query per row.
            "roles": sorted(ROLE_LABELS.get(g.name, g.name) for g in u.groups.all()),
        }

    recent = [
        card(u)
        for u in live.prefetch_related("groups")
        .select_related("belt", "domain")
        .order_by("-date_of_joining", "-id")[:8]
    ]
    inactive = [
        card(u)
        for u in live.filter(is_active=False)
        .prefetch_related("groups")
        .select_related("belt", "domain")
        .order_by("name")[:20]
    ]
    # Deliberately **not** reported: a "never signed in" figure. ``last_login``
    # is never written — SimpleJWT only updates it with ``UPDATE_LAST_LOGIN``,
    # which this project does not set — so every account would be flagged. A
    # metric that is always 100% is worse than no metric.
    #
    # No belt = not allocatable, since the people-picker filters on it — the
    # gap worth surfacing on this screen instead.
    no_belt = [
        card(u)
        for u in live.filter(is_active=True, belt__isnull=True)
        .prefetch_related("groups")
        .select_related("belt", "domain")
        .order_by("name")[:20]
    ]
    # "Employee" is implicit on everyone, so a user carrying only that group has
    # no role of their own — they can log in and do nothing but their own tasks.
    role_only_employee = [
        card(u)
        for u in live.filter(is_active=True)
        .prefetch_related("groups")
        .select_related("belt", "domain")
        .annotate(
            other_roles=Count("groups", filter=~Q(groups__name="employee"), distinct=True)
        )
        .filter(other_roles=0)
        .order_by("name")[:20]
    ]

    return {
        "generated_at": now,
        "totals": {
            "total": live.count(),
            "active": live.filter(is_active=True).count(),
            "inactive": live.filter(is_active=False).count(),
            "deleted": everyone.filter(is_deleted=True).count(),
            "joined_this_month": live.filter(date_of_joining__gte=month_start).count(),
            "with_belt": live.filter(belt__isnull=False).count(),
            "no_belt": live.filter(is_active=True, belt__isnull=True).count(),
        },
        "by_role": by_role,
        "by_belt": by_belt,
        "by_domain": by_domain,
        "joining_trend": list(series.values()),
        "recent": recent,
        "attention": {
            "inactive": inactive,
            "no_belt": no_belt,
            "no_role": role_only_employee,
        },
    }
