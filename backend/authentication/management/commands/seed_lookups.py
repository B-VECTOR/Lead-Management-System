from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand

from authentication.models import Belt

GROUP_NAMES = [
    "user_management",
    "lead_admin",
    "lead_manager",
    "marketing",
    "resource_manager",
    "finance",
    "employee",
]

BELT_NAMES_IN_ORDER = [
    "Potential Black",
    "Black",
    "White",
    "Brown",
    "Red",
    "Potential Brown",
    "Potential White",
    "Potential Red",
    "NA",
]

# The user-management API/pages are gated on these four model permissions
# (see authentication.permissions.UserManagementPermission), so the
# user_management group needs them to actually manage users.
USER_MANAGEMENT_CODENAMES = ["add_user", "change_user", "delete_user", "view_user"]


class Command(BaseCommand):
    help = "Seed the fixed role groups and belt levels (idempotent)."

    def handle(self, *args, **options):
        for name in GROUP_NAMES:
            group, created = Group.objects.get_or_create(name=name)
            self.stdout.write(f"{'Created' if created else 'Exists'} group: {name}")

        user_management_group = Group.objects.get(name="user_management")
        perms = Permission.objects.filter(
            content_type__app_label="authentication",
            codename__in=USER_MANAGEMENT_CODENAMES,
        )
        user_management_group.permissions.add(*perms)
        self.stdout.write(f"Granted {perms.count()} user-management permission(s) to 'user_management' group")

        for order, name in enumerate(BELT_NAMES_IN_ORDER):
            belt, created = Belt.objects.get_or_create(name=name, defaults={"order": order})
            if not created and belt.order != order:
                belt.order = order
                belt.save(update_fields=["order"])
            self.stdout.write(f"{'Created' if created else 'Exists'} belt: {name} (order={order})")

        self.stdout.write(self.style.SUCCESS("Lookup data seeded."))
