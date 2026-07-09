from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .forms import UserChangeForm, UserCreationForm
from .models import Belt, User


@admin.register(Belt)
class BeltAdmin(admin.ModelAdmin):
    list_display = ("name", "order")
    list_editable = ("order",)
    ordering = ("order", "name")
    search_fields = ("name",)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    add_form = UserCreationForm
    form = UserChangeForm
    model = User

    list_display = (
        "email",
        "name",
        "employee_id",
        "belt",
        "domain",
        "is_staff",
        "is_active",
        "is_deleted",
    )
    list_filter = (
        "is_staff",
        "is_superuser",
        "is_active",
        "is_deleted",
        "belt",
        "groups",
    )
    search_fields = ("email", "name", "employee_id", "mobile_no")
    ordering = ("email",)

    def get_queryset(self, request):
        # The default manager hides soft-deleted users; the admin should
        # still show every row so staff can inspect or restore them.
        qs = self.model.all_objects.get_queryset()
        ordering = self.get_ordering(request)
        if ordering:
            qs = qs.order_by(*ordering)
        return qs

    _personal_info = (_("Personal info"), {"fields": ("name", "mobile_no")})
    _employment = (
        _("Employment"),
        {
            "fields": (
                "employee_id",
                "belt",
                "acting_belt_level",
                "domain",
                "date_of_joining",
            )
        },
    )

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        _personal_info,
        _employment,
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_deleted",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
        _personal_info,
        _employment,
    )
