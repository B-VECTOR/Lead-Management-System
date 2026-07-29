"""R9-1 — the Project ID becomes the business's primary identifier.

Adds the display-only ``project_id`` snapshot column to the remaining
lead-scoped tables (``resource_table``, follow-ups, attachments, the activity
log, lead holds), continuing the pattern migrations 0023/0024 established for
``lead_stage``/``task_details``, and backfills every existing row.

**Not a re-key** (D1 / TR §13): joins still key on numeric PKs. This column is
read by humans and reports only.
"""

from django.db import migrations, models


def backfill(apps, schema_editor):
    """Stamp existing rows: a stage-bound row takes its stage's snapshot, a
    lead-scoped row takes the lead's stable Project ID."""
    ResourceAllocation = apps.get_model("leads", "ResourceAllocation")
    for row in ResourceAllocation.objects.select_related("stage", "lead").iterator():
        value = (row.stage.project_id if row.stage_id else "") or row.lead.project_id
        if value:
            ResourceAllocation.objects.filter(pk=row.pk).update(project_id=value)
    for name in ("Followup", "Attachment", "ActivityLog", "LeadHold"):
        Model = apps.get_model("leads", name)
        for row in Model.objects.select_related("lead").iterator():
            if row.lead.project_id:
                Model.objects.filter(pk=row.pk).update(project_id=row.lead.project_id)


def unbackfill(apps, schema_editor):
    """No-op — reversing the AddFields drops the columns outright."""


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0024_stored_table_names_and_report_columns'),
    ]

    operations = [
        migrations.AddField(
            model_name='activitylog',
            name='project_id',
            field=models.CharField(blank=True, default='', help_text="Display snapshot of the lead's Project ID when this row was created; not a join key (§13).", max_length=50, verbose_name='project ID'),
        ),
        migrations.AddField(
            model_name='attachment',
            name='project_id',
            field=models.CharField(blank=True, default='', help_text="Display snapshot of the lead's Project ID when this row was created; not a join key (§13).", max_length=50, verbose_name='project ID'),
        ),
        migrations.AddField(
            model_name='followup',
            name='project_id',
            field=models.CharField(blank=True, default='', help_text="Display snapshot of the lead's Project ID when this row was created; not a join key (§13).", max_length=50, verbose_name='project ID'),
        ),
        migrations.AddField(
            model_name='leadhold',
            name='project_id',
            field=models.CharField(blank=True, default='', help_text="Display snapshot of the lead's Project ID when this row was created; not a join key (§13).", max_length=50, verbose_name='project ID'),
        ),
        migrations.AddField(
            model_name='resourceallocation',
            name='project_id',
            field=models.CharField(blank=True, default='', help_text="Display snapshot of the lead's Project ID when this row was created; not a join key (§13).", max_length=50, verbose_name='project ID'),
        ),
        migrations.RunPython(backfill, unbackfill),
    ]
