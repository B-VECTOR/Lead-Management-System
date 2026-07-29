"""Renumber legacy extension loops so the counter starts at ``E1`` (D13).

The loop used to start at ``E0`` (``E0 → E1 → …``); as of the 2026-07-29
decision the first extension is ``E1`` (``E1 → E2 → …``). New leads get the new
numbering from ``projects.next_extension_stage_code``; this migration brings
data created under the old rule in line, so no project shows an ``E0`` cycle.

Every lead that has an ``E0`` stage has **all** of its extension stages shifted
up by one (``E0 → E1``, ``E1 → E2``, …), which preserves the loops' order and
count. Leads whose loops already start at ``E1`` are untouched.

The shift rewrites, for the affected leads only:

* ``lead_stage.stage`` — the loop code itself,
* every stored ``project_id`` display snapshot whose suffix is the loop
  (``…-E0`` → ``…-E1``, including a Mining lead's ``…-M-E0``) across
  ``lead_stage``, ``task_details``, ``resource_allocation``, ``project_details``,
  lead holds, follow-ups, attachments and the activity log,
* ``project_details.project`` — the denormalized cycle-code copy.

Not reversible: once shifted there is no record of which leads were shifted, so
a blanket decrement would corrupt leads that legitimately start at ``E1``.
"""

import re

from django.db import migrations

# The trailing ``-E{n}`` segment of a display Project ID, and a bare loop code.
_PID_SUFFIX = re.compile(r"-E(\d+)$")
_STAGE_CODE = re.compile(r"^E(\d+)$")

# (model, ORM path from the model to its lead) — every leads-app table carrying
# a ``project_id`` display snapshot (Lead itself is excluded: its stable
# lead-level ID never carries a stage suffix, §13).
_SNAPSHOT_TABLES = [
    ("LeadStage", "lead_id__in"),
    ("Task", "lead_id__in"),
    ("ResourceAllocation", "lead_id__in"),
    ("ProjectDetails", "lead_id__in"),
    ("LeadHold", "lead_id__in"),
    ("Followup", "lead_id__in"),
    ("Attachment", "lead_id__in"),
    ("ActivityLog", "lead_id__in"),
]


def _bump_suffix(value):
    """``IN-…-E0`` → ``IN-…-E1``; anything else comes back unchanged."""
    return _PID_SUFFIX.sub(lambda m: f"-E{int(m.group(1)) + 1}", value or "")


def _bump_code(value):
    """``E0`` → ``E1``; anything else comes back unchanged."""
    return _STAGE_CODE.sub(lambda m: f"E{int(m.group(1)) + 1}", value or "")


def shift_extension_loops(apps, schema_editor):
    LeadStage = apps.get_model("leads", "LeadStage")

    lead_ids = list(
        LeadStage.objects.filter(stage="E0").values_list("lead_id", flat=True).distinct()
    )
    if not lead_ids:
        return

    # Stage codes first, highest loop down, so a shifted row never lands on a
    # code the next row still holds.
    stages = LeadStage.objects.filter(lead_id__in=lead_ids, stage__regex=r"^E\d+$")
    for stage in sorted(stages, key=lambda s: int(s.stage[1:]), reverse=True):
        stage.stage = _bump_code(stage.stage)
        stage.project_id = _bump_suffix(stage.project_id)
        stage.save(update_fields=["stage", "project_id"])

    # Then every display snapshot that copied a loop-suffixed ID.
    for model_name, lookup in _SNAPSHOT_TABLES:
        if model_name == "LeadStage":
            continue  # already rewritten above
        model = apps.get_model("leads", model_name)
        rows = model.objects.filter(**{lookup: lead_ids}).exclude(project_id="")
        for row in rows:
            shifted = _bump_suffix(row.project_id)
            if shifted != row.project_id:
                row.project_id = shifted
                row.save(update_fields=["project_id"])

    ProjectDetails = apps.get_model("leads", "ProjectDetails")
    for row in ProjectDetails.objects.filter(lead_id__in=lead_ids, project__regex=r"^E\d+$"):
        row.project = _bump_code(row.project)
        row.save(update_fields=["project"])


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0027_restore_named_resource_slots"),
    ]

    operations = [
        migrations.RunPython(shift_extension_loops, migrations.RunPython.noop),
    ]
