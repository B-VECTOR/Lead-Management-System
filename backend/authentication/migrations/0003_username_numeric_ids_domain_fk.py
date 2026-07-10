"""Phase 2 — User-model reconciliation (Decisions #3, #7; Tech Req §4.1).

Restores ``username`` as the login identifier, converts ``employee_id`` /
``mobile_no`` to numeric (≥ 0), and turns ``domain`` from free text into an
FK → ``reference.Area``. Includes the data migration for existing rows.

The operation order matters:
  * ``username`` is added nullable, backfilled, then tightened to unique /
    non-null (its final AbstractUser shape).
  * ``employee_id`` / ``mobile_no`` are still CharFields during RunPython, so
    their string values are rewritten to digit-only strings *before* the
    AlterField casts the column to an integer type (Postgres can then cast
    e.g. '1'::int, but could not cast 'EMP-001').
  * ``domain`` text is preserved by renaming the old column aside, adding the
    new FK, mapping text → Area, then dropping the old column.

Coercion rules for the existing (dev bootstrap) rows — see PLAN.md deviation
notes:
  * username  ← email local-part; on empty/collision, suffixed with pk.
  * employee_id ← digits extracted from the old value; on empty/collision,
    falls back to the row's pk (guaranteed unique, ≥ 0).
  * mobile_no ← digits extracted from the old value (drops any '+'/spaces);
    empty → 0.
  * domain    ← case-insensitive exact match against Area.name; no match → NULL
    (domain is optional). Unmapped values are printed for visibility.
"""

import re

import django.contrib.auth.validators
import django.db.models.deletion
from django.db import migrations, models


def _digits(value):
    return re.sub(r"\D", "", value or "")


def forwards(apps, schema_editor):
    User = apps.get_model("authentication", "User")
    Area = apps.get_model("reference", "Area")

    # Case-insensitive Area lookup by name.
    areas_by_name = {a.name.lower(): a for a in Area.objects.all()}

    used_usernames = set()
    used_employee_ids = set()
    unmapped_domains = set()

    # Deterministic order so collision fallbacks are reproducible.
    for user in User.objects.all().order_by("pk"):
        # --- username ---
        base = (user.email or "").split("@")[0].strip().lower() or f"user{user.pk}"
        candidate = base
        if candidate in used_usernames:
            candidate = f"{base}{user.pk}"
        used_usernames.add(candidate)
        user.username = candidate

        # --- employee_id (still a CharField here) ---
        digits = _digits(user.employee_id)
        emp = int(digits) if digits else None
        if emp is None or emp in used_employee_ids:
            emp = user.pk  # unique, ≥ 0
            # In the unlikely event the pk itself collides, walk forward.
            while emp in used_employee_ids:
                emp += 1
        used_employee_ids.add(emp)
        user.employee_id = str(emp)

        # --- mobile_no (still a CharField here) ---
        user.mobile_no = _digits(user.mobile_no) or "0"

        # --- domain text → Area FK ---
        old = (user.domain_old or "").strip()
        area = areas_by_name.get(old.lower()) if old else None
        if old and area is None:
            unmapped_domains.add(old)
        user.domain = area

        user.save(
            update_fields=["username", "employee_id", "mobile_no", "domain"]
        )

    if unmapped_domains:
        print(
            "\n  [0003] domain values with no matching Area (set to NULL): "
            + ", ".join(sorted(unmapped_domains))
        )


def backwards(apps, schema_editor):
    # Best-effort reverse: restore the old domain text column from the FK's
    # Area name. username / numeric coercion are not reversed (lossy).
    User = apps.get_model("authentication", "User")
    for user in User.objects.all():
        user.domain_old = user.domain.name if user.domain_id else ""
        user.save(update_fields=["domain_old"])


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0001_initial"),
        ("authentication", "0002_replace_first_last_name_with_name"),
    ]

    operations = [
        # 1. username: add nullable so existing rows can be backfilled.
        migrations.AddField(
            model_name="user",
            name="username",
            field=models.CharField(max_length=150, null=True),
        ),
        # 2. Preserve the old free-text domain, then add the new FK column.
        migrations.RenameField(
            model_name="user",
            old_name="domain",
            new_name="domain_old",
        ),
        migrations.AddField(
            model_name="user",
            name="domain",
            field=models.ForeignKey(
                blank=True,
                help_text="Competency domain — shares the `areas` table (Tech Req §4.1).",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="users",
                to="reference.area",
                verbose_name="domain",
            ),
        ),
        # 3. Backfill + coerce existing rows (fields still CharField here).
        migrations.RunPython(forwards, backwards),
        # 4. Drop the old text column.
        migrations.RemoveField(
            model_name="user",
            name="domain_old",
        ),
        # 5. Cast the now-numeric-string columns to integer types.
        migrations.AlterField(
            model_name="user",
            name="employee_id",
            field=models.PositiveIntegerField(unique=True, verbose_name="employee ID"),
        ),
        migrations.AlterField(
            model_name="user",
            name="mobile_no",
            field=models.PositiveBigIntegerField(verbose_name="mobile number"),
        ),
        # 6. Tighten username to its final AbstractUser shape (unique, required).
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(
                error_messages={"unique": "A user with that username already exists."},
                help_text="Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.",
                max_length=150,
                unique=True,
                validators=[django.contrib.auth.validators.UnicodeUsernameValidator()],
                verbose_name="username",
            ),
        ),
    ]
