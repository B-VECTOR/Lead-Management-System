import django.core.validators
from django.db import migrations, models


def placeholder_bad_mobile_numbers(apps, schema_editor):
    """Pre-existing rows that predate the 10-digit rule get a placeholder so
    the column-type change below doesn't fail; each must be corrected by hand
    afterward via the Users UI.
    """
    # Placeholder must itself be 10 digits with no leading zero (the field is
    # still an integer column at this point in the migration, so a leading
    # zero would be silently dropped before the column type change below).
    User = apps.get_model("authentication", "User")
    for user in User.objects.all():
        if not str(user.mobile_no).isdigit() or len(str(user.mobile_no)) != 10:
            user.mobile_no = "9999999999"
            user.save(update_fields=["mobile_no"])


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0006_alter_user_employee_id"),
    ]

    operations = [
        migrations.RunPython(placeholder_bad_mobile_numbers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="mobile_no",
            field=models.CharField(
                max_length=10,
                validators=[
                    django.core.validators.RegexValidator(
                        regex="^\\d{10}$",
                        message="Enter a valid 10-digit mobile number.",
                    )
                ],
                verbose_name="mobile number",
            ),
        ),
    ]
