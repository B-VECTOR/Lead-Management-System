# Phase 12: Execution Brown reverts from a multi-select (M2M, Phase 10d) to a
# single holder (FK), per the user (one Brown per stage). Data-preserving: the
# first Brown in each allocation's set becomes the FK before the M2M is dropped.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def copy_first_brown_to_fk(apps, schema_editor):
    ResourceAllocation = apps.get_model("leads", "ResourceAllocation")
    for alloc in ResourceAllocation.objects.all():
        first = alloc.execution_browns.first()
        if first is not None:
            alloc.execution_brown = first
            alloc.save(update_fields=["execution_brown"])


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0008_alter_notification_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='resourceallocation',
            name='execution_brown',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL, verbose_name='execution brown'),
        ),
        migrations.RunPython(copy_first_brown_to_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='resourceallocation',
            name='execution_browns',
        ),
    ]
