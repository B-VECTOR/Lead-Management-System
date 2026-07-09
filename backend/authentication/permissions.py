from rest_framework.permissions import BasePermission


class UserManagementPermission(BasePermission):
    """Restrict the user CRUD API to a "user management" role.

    Only authenticated users holding the relevant ``users.*_user`` model
    permissions may call this API (e.g. members of a "User Managers" group
    granted add/change/delete/view permissions on User via the admin).

    Written against ``request.method`` directly (rather than extending
    DRF's ``DjangoModelPermissions``) so a single class gates all four
    verbs uniformly and so read access is gated on ``view_user`` -- DRF's
    ``DjangoModelPermissions`` leaves GET ungated by default.
    """

    codename_for_method = {
        "GET": "view_user",
        "POST": "add_user",
        "PUT": "change_user",
        "PATCH": "change_user",
        "DELETE": "delete_user",
    }

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        codename = self.codename_for_method.get(request.method)
        if codename is None:  # e.g. OPTIONS/HEAD
            return True
        return request.user.has_perm(f"authentication.{codename}")
