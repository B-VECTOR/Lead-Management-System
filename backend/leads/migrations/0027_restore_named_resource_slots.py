"""R12 — restore the named resource slots retired by migration ``0020``.

Choices-only (no data change): ``resource_table.slot`` regains ``auditor_3`` /
``auditor_4`` and ``project_member_1``–``project_member_10``, which the
pre-``0020`` wide table carried as columns. Existing rows are untouched — every
one of them uses a slot value that is still valid.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0026_project_id_full_composition'),
    ]

    operations = [
        migrations.AlterField(
            model_name='resourceallocation',
            name='slot',
            field=models.CharField(choices=[('execution_red', 'Execution Red'), ('execution_brown', 'Execution Brown'), ('white', 'White'), ('auditor_1', 'Auditor 1'), ('auditor_2', 'Auditor 2'), ('auditor_3', 'Auditor 3'), ('auditor_4', 'Auditor 4'), ('project_member_1', 'Project Member 1'), ('project_member_2', 'Project Member 2'), ('project_member_3', 'Project Member 3'), ('project_member_4', 'Project Member 4'), ('project_member_5', 'Project Member 5'), ('project_member_6', 'Project Member 6'), ('project_member_7', 'Project Member 7'), ('project_member_8', 'Project Member 8'), ('project_member_9', 'Project Member 9'), ('project_member_10', 'Project Member 10')], max_length=20, verbose_name='slot'),
        ),
    ]
