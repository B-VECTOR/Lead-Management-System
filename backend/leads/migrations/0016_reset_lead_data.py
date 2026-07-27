# Phase R1 (v4.0/v17.0 rebuild) — data reset (decision D4).
#
# Clears all Lead rows (cascading to tasks, checklists, resource allocations,
# project_details, follow-ups, holds, attachments, activity, notifications) so
# the R1 schema change in 0017 carries no stale country / Hybernation /
# Short-Closed data — there is no back-mapping path. Reference / user / group /
# belt seed data is untouched.
#
# Split from the schema migration on purpose: Postgres cannot ALTER a table in
# the same transaction that still has pending trigger events from a bulk delete.
# Running the wipe in its own migration lets it commit before 0017 alters the
# table. The reverse is a no-op — deleted rows are not restored (acceptable
# per D4); migrating back still restores the schema via 0017's reverse.

from django.db import migrations


def clear_lead_data(apps, schema_editor):
    Lead = apps.get_model('leads', 'Lead')
    Lead.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0015_projectdetails_short_close_remark_alter_lead_status_and_more'),
    ]

    operations = [
        migrations.RunPython(clear_lead_data, migrations.RunPython.noop),
    ]
