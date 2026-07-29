"""Retire "TBD" as an allocation occupant (R14-1).

A White slot used to be fillable as **TBD** ("to be decided") — a row with no
``user``, which then showed up wherever resources are listed as if TBD were a
person (a named chip in the allocation form, a resource in the Resource-History
dashboard). TBD is not a user, and an undecided slot is already fully expressed
by there being no row for it, so the option is gone: every allocation now names a
real person.

For the rows created under the old rule:

* still-``allocated`` TBD rows are **released** — they occupy a White slot that
  the UI no longer renders, so leaving them allocated would keep a ghost
  occupant in the pool's headcount that nobody could clear,
* their ``names`` snapshot (the literal string ``"TBD"``) is cleared to ``""``,
  the value a row with no user carries.

The rows themselves are kept (``resource_allocation`` is append-only history) and
so is the ``is_tbd`` flag, purely so those rows stay identifiable — the resource
screens filter them out.

Reversible in shape only: re-allocating a released TBD row is not something the
application can produce any more, so the reverse just restores the ``names``
snapshot and leaves the release in place.
"""

from django.db import migrations, models
from django.utils import timezone


def retire_tbd_rows(apps, schema_editor):
    ResourceAllocation = apps.get_model("leads", "ResourceAllocation")
    ResourceAllocation.objects.filter(is_tbd=True, status="allocated").update(
        status="released", released_on=timezone.now(),
    )
    ResourceAllocation.objects.filter(is_tbd=True).update(names="")


def restore_names(apps, schema_editor):
    ResourceAllocation = apps.get_model("leads", "ResourceAllocation")
    ResourceAllocation.objects.filter(is_tbd=True).update(names="TBD")


class Migration(migrations.Migration):

    dependencies = [
        ("leads", "0028_extension_loops_start_at_e1"),
    ]

    operations = [
        migrations.AlterField(
            model_name="resourceallocation",
            name="is_tbd",
            field=models.BooleanField(
                default=False,
                help_text="Legacy — retired in R14-1; every allocation names a person.",
                verbose_name="is TBD (legacy)",
            ),
        ),
        migrations.RunPython(retire_tbd_rows, restore_names),
    ]
