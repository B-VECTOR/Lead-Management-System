"""Meeting decision 2026-07-27: persist the display Project ID on lead_stage
and task_details, and align the column names with the meeting-note spec.

- Rename ``Task.opened_at`` → ``task_start_dt`` and ``Task.closed_at`` →
  ``task_end_dt`` (§4.5 canonical names).
- Rename ``ResourceAllocation.allocation_task`` → ``task`` (column ``task_id``, §4.7).
- Add a stored ``project_id`` **display snapshot** to ``LeadStage`` and ``Task``
  (base_code + stage suffix). It is display-only — joins still key on numeric
  PKs, never on this string (§13).
- Backfill both new columns for every existing row so the values are visible
  immediately, matching what ``projects.project_id_for_stage`` would compute.
"""
from django.db import migrations, models


# Stage code the Mining cycle itself uses (mirrors ``LeadStage.MINING``); a
# Mining lead's IDs carry a ``-M`` marker before any further suffix (§13).
_MINING_STAGE = "M"
_MINING_LEAD_TYPE = "Mining"


def _project_id_for(base_code, lead_type, stage_code):
    """Replicates ``projects.project_id_for_stage`` for the backfill (kept inline
    so the migration does not depend on app code that may change later)."""
    if not base_code:
        return ""
    if lead_type == _MINING_LEAD_TYPE:
        suffix = "" if stage_code == _MINING_STAGE else f"-{stage_code}"
        return f"{base_code}-M{suffix}"
    return f"{base_code}-{stage_code}"


def backfill_project_id(apps, schema_editor):
    LeadStage = apps.get_model("leads", "LeadStage")
    Task = apps.get_model("leads", "Task")

    for stage in LeadStage.objects.select_related("lead").iterator():
        stage.project_id = _project_id_for(
            stage.lead.base_code, stage.lead.lead_type, stage.stage
        )
        stage.save(update_fields=["project_id"])

    # A task inherits its stage's snapshot; tasks with no stage yet (pending
    # trigger tasks) stay blank until they open, exactly like new rows.
    for task in Task.objects.select_related("stage").iterator():
        task.project_id = task.stage.project_id if task.stage_id else ""
        task.save(update_fields=["project_id"])


def noop_reverse(apps, schema_editor):
    """The column drop (reverse of AddField) discards the data; nothing to undo."""


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0022_r6_base_code_not_unique"),
    ]

    operations = [
        migrations.RenameField(
            model_name="task",
            old_name="opened_at",
            new_name="task_start_dt",
        ),
        migrations.RenameField(
            model_name="task",
            old_name="closed_at",
            new_name="task_end_dt",
        ),
        migrations.RenameField(
            model_name="resourceallocation",
            old_name="allocation_task",
            new_name="task",
        ),
        migrations.AddField(
            model_name="leadstage",
            name="project_id",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Display snapshot for this stage (base_code + suffix); not a join key (§13).",
                max_length=50,
                verbose_name="project ID",
            ),
        ),
        migrations.AddField(
            model_name="task",
            name="project_id",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Display snapshot copied from the task's stage; not a join key (§13).",
                max_length=50,
                verbose_name="project ID",
            ),
        ),
        migrations.RunPython(backfill_project_id, noop_reverse),
    ]
