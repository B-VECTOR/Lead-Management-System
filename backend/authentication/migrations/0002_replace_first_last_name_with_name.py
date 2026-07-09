from django.db import migrations, models


def combine_names_forward(apps, schema_editor):
    User = apps.get_model("authentication", "User")
    for user in User.objects.all():
        User.objects.filter(pk=user.pk).update(
            name=f"{user.first_name} {user.last_name}".strip()
        )


def split_name_backward(apps, schema_editor):
    User = apps.get_model("authentication", "User")
    for user in User.objects.all():
        first, _, last = (user.name or "").strip().partition(" ")
        User.objects.filter(pk=user.pk).update(first_name=first, last_name=last)


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="name",
            field=models.CharField(default="", max_length=300, verbose_name="name"),
            preserve_default=False,
        ),
        migrations.RunPython(combine_names_forward, split_name_backward),
        migrations.RemoveField(
            model_name="user",
            name="first_name",
        ),
        migrations.RemoveField(
            model_name="user",
            name="last_name",
        ),
    ]
