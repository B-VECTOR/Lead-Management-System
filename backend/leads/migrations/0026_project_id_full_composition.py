"""Project ID composition finalized by the user 2026-07-28 (TR §13, D1 amended).

The base becomes ``{Country}-{Industry}{Area}{Type}{YY}{Seq}``
(``IN-PHNPDCFF26001``) — Country Code, Industry, Area, Type of Project, Year,
auto-generated number — with the stage of intervention staying the derived/
snapshotted suffix it already was (``-BD``/``-2HR``/``-SnT``/``-IM``/``-E{n}``/
``-M``). Two consequences handled here:

1. **``country`` returns to the lead** (reversing R1's §5.17 drop — the
   ``reference.Country`` table was kept, so only the FK is new). Existing rows
   are backfilled to India before the column goes ``NOT NULL``.
2. **Every existing Project ID is regenerated** in the new format (the user
   chose "regenerate all" over wiping the data), and each ``project_id``
   display snapshot is re-stamped by swapping its old base prefix for the new
   one — which preserves the stage suffix on the row exactly as it was,
   including ``-M-E{n}``.

The auto-generated number is now **one counter per year, globally** (it was per
Area+Year), so regeneration renumbers every base in creation order.

Reversible: the reverse pass rebuilds the pre-2026-07-28 ``{Area}{YY}{Seq}``
bases (per-Area sequence) and swaps the snapshots back before dropping the
column.
"""

import django.db.models.deletion
from django.db import migrations, models

# Mirrors Lead.TYPE_OF_PROJECT_CODES (§13.4). Duplicated rather than imported:
# a migration must keep working against the historical model state even if the
# live map is later edited.
TYPE_CODES = {
    "Consulting Full Fledged": "CFF",
    "AMC": "AMC",
    "Upgrade": "UPG",
    "Vectorflow Lite": "VFL",
    "Audit only": "AO",
    "Consulting Lite + No software": "CLNS",
}

# Tables carrying a display-only project_id snapshot (migrations 0023–0025).
SNAPSHOT_MODELS = [
    "LeadStage",
    "Task",
    "ProjectDetails",
    "ResourceAllocation",
    "Followup",
    "Attachment",
    "ActivityLog",
    "LeadHold",
]


def backfill_country(apps, schema_editor):
    """Give every existing lead a country so the column can go NOT NULL.

    India, per the migration decision — the codes are editable per-lead
    afterwards. Falls back to any existing country, and creates India if the
    reference table happens to be empty (a DB seeded before ``seed_reference``).
    """
    Country = apps.get_model("reference", "Country")
    Lead = apps.get_model("leads", "Lead")
    if not Lead.objects.exists():
        return
    country = (
        Country.objects.filter(code="IN").first()
        or Country.objects.order_by("id").first()
        or Country.objects.create(name="India", code="IN", status="active")
    )
    Lead.objects.filter(country__isnull=True).update(country=country)


def unbackfill_country(apps, schema_editor):
    """No-op — reversing past this point drops the column outright."""


def _year_of(lead):
    """The Year segment: the lead's creation year (§13).

    Taken from ``created_at`` rather than re-parsed out of the old code — one
    dev row carried a base whose year digits disagreed with its creation date,
    and creation date is the authority.
    """
    return lead.created_at.year


def _rebuild(apps, *, new_format):
    """Renumber every ``base_code`` and re-stamp every snapshot.

    ``new_format=True`` writes the 2026-07-28 composition (global per-year
    sequence); ``False`` restores the previous ``{Area}{YY}{Seq}`` (per-Area
    sequence). Both share the prefix-swap that keeps each row's stage suffix.
    """
    Lead = apps.get_model("leads", "Lead")
    leads = list(
        Lead.objects.select_related("country", "industry", "domain")
        .exclude(base_code__isnull=True)
        .exclude(base_code="")
        .order_by("created_at", "id")
    )
    if not leads:
        return

    # Group by current base so a Mining child keeps sharing its parent's base
    # (§13) instead of consuming a second number.
    groups = {}
    for lead in leads:
        groups.setdefault(lead.base_code, []).append(lead)

    counters = {}  # (scope key) -> last sequence used
    old_to_new = {}
    for old_base, members in groups.items():
        source = members[0]  # earliest-created; Mining children copy its codes
        year = _year_of(source)
        yy = f"{year % 100:02d}"
        if new_format:
            scope = year
        else:
            scope = (source.domain.code, year)
        seq = counters.get(scope, 0) + 1
        counters[scope] = seq
        if new_format:
            type_code = TYPE_CODES.get(source.type_of_project, "")
            core = f"{source.industry.code}{source.domain.code}{type_code}{yy}{seq:03d}"
            new_base = f"{source.country.code}-{core}"
        else:
            new_base = f"{source.domain.code}{yy}{seq:03d}"
        old_to_new[old_base] = new_base

        for lead in members:
            # lead.project_id is the stable ID: base (+ "-M" for a Mining lead).
            stable = new_base + ("-M" if lead.lead_type == "Mining" else "")
            Lead.objects.filter(pk=lead.pk).update(base_code=new_base, project_id=stable)

    # Snapshots: swap the old base prefix for the new one, leaving whatever
    # suffix the row recorded ("-IM", "-M-E1", …) untouched.
    for name in SNAPSHOT_MODELS:
        Model = apps.get_model("leads", name)
        for row in Model.objects.exclude(project_id="").only("pk", "project_id").iterator():
            for old_base, new_base in old_to_new.items():
                if row.project_id.startswith(old_base):
                    Model.objects.filter(pk=row.pk).update(
                        project_id=new_base + row.project_id[len(old_base):]
                    )
                    break


def _stage_snapshot(lead, stage_code):
    """``projects.project_id_for_stage`` replicated for the historical state."""
    if not lead.base_code:
        return ""
    if lead.lead_type == "Mining":
        return lead.base_code + "-M" + (f"-{stage_code}" if stage_code != "M" else "")
    return f"{lead.base_code}-{stage_code}"


def stamp_blank_snapshots(apps, schema_editor):
    """Fill ``project_id`` snapshots left empty by migration 0023's backfill.

    0023 stamped ``lead_stage``/``task_details`` from ``lead.project_id`` — a
    column 0024 only populated *afterwards* — so every row that already existed
    at 0023 was stamped with an empty string. With the Project ID now the
    business's identifier, those rows are filled here from the same rules the
    live code uses (stage rows compose base + their own suffix; everything else
    takes its stage's snapshot, or the lead's stable ID when it has no stage).

    Not reversed: reversal restores the old *format* (see :func:`_rebuild`) but
    deliberately leaves these rows stamped rather than re-emptying them — the
    blanks were a bug, not state worth restoring.
    """
    LeadStage = apps.get_model("leads", "LeadStage")

    stages = {}  # pk -> snapshot, for the stage-bound tables below
    for stage in LeadStage.objects.select_related("lead").iterator():
        value = stage.project_id or _stage_snapshot(stage.lead, stage.stage)
        if value and value != stage.project_id:
            LeadStage.objects.filter(pk=stage.pk).update(project_id=value)
        stages[stage.pk] = value

    # Stage-bound rows inherit their stage's snapshot; lead-scoped rows take the
    # lead's stable ID (the suffix of a long-gone "current" stage is not
    # recoverable, and the stable ID is the honest fallback).
    for name in ("Task", "ProjectDetails", "ResourceAllocation"):
        Model = apps.get_model("leads", name)
        for row in Model.objects.filter(project_id="").select_related("lead").iterator():
            value = stages.get(row.stage_id) or row.lead.project_id
            if value:
                Model.objects.filter(pk=row.pk).update(project_id=value)

    for name in ("Followup", "Attachment", "ActivityLog", "LeadHold"):
        Model = apps.get_model("leads", name)
        for row in Model.objects.filter(project_id="").select_related("lead").iterator():
            if row.lead.project_id:
                Model.objects.filter(pk=row.pk).update(project_id=row.lead.project_id)


def keep_snapshots(apps, schema_editor):
    """No-op — see :func:`stamp_blank_snapshots`."""


def regenerate_new_format(apps, schema_editor):
    _rebuild(apps, new_format=True)


def regenerate_old_format(apps, schema_editor):
    _rebuild(apps, new_format=False)


class Migration(migrations.Migration):

    # Postgres refuses to build the NOT NULL FK index in the same transaction
    # that just UPDATEd every row ("cannot CREATE INDEX … pending trigger
    # events"), so each operation gets its own transaction; the two data passes
    # opt back in individually below.
    atomic = False

    dependencies = [
        ('leads', '0025_r9_project_id_snapshots'),
        ('reference', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='lead',
            name='country',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='leads',
                to='reference.country',
                verbose_name='country',
            ),
        ),
        migrations.RunPython(backfill_country, unbackfill_country, atomic=True),
        migrations.AlterField(
            model_name='lead',
            name='country',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='leads',
                to='reference.country',
                verbose_name='country',
            ),
        ),
        migrations.AlterField(
            model_name='lead',
            name='base_code',
            field=models.CharField(
                blank=True,
                help_text='Stable {Country}-{Industry}{Area}{Type}{YY}{Seq}; generated at creation (R2); shared with Mining children (R6).',
                max_length=50,
                null=True,
                verbose_name='project base code',
            ),
        ),
        migrations.RunPython(regenerate_new_format, regenerate_old_format, atomic=True),
        migrations.RunPython(stamp_blank_snapshots, keep_snapshots, atomic=True),
    ]
