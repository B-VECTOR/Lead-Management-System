from django import forms
from django.contrib.auth.forms import UserChangeForm as BaseUserChangeForm
from django.contrib.auth.forms import UserCreationForm as BaseUserCreationForm
from django.contrib.auth.models import Group

from .models import User

# Extra profile fields surfaced on the create / edit forms.
PROFILE_FIELDS = (
    "name",
    "employee_id",
    "mobile_no",
    "belt",
    "acting_belt_level",
    "domain",
    "date_of_joining",
)

PROFILE_WIDGETS = {
    "date_of_joining": forms.DateInput(attrs={"type": "date"}),
}


GROUPS_FIELD = forms.ModelMultipleChoiceField(
    queryset=Group.objects.all(),
    widget=forms.SelectMultiple,
    required=False,
    label="Groups",
)


class UserCreationForm(BaseUserCreationForm):
    # No explicit `groups` field here (unlike ManagedUserUpdateForm below):
    # leaving it to ModelForm auto-generation lets UserAdmin.filter_horizontal
    # (inherited from django.contrib.auth.admin.UserAdmin) render the admin's
    # dual-pane "available/chosen" widget instead of a plain multi-select.

    class Meta(BaseUserCreationForm.Meta):
        model = User
        fields = ("username", "email") + PROFILE_FIELDS + ("groups",)
        widgets = PROFILE_WIDGETS


class UserChangeForm(BaseUserChangeForm):
    # See UserCreationForm above re: no explicit `groups` field.

    class Meta(BaseUserChangeForm.Meta):
        model = User
        fields = ("username", "email") + PROFILE_FIELDS + ("groups",)
        widgets = PROFILE_WIDGETS

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Show only the "Reset password" button for the password field:
        # drop the "Raw passwords are not stored…" help text and swap the
        # widget template for one that omits the password-hash summary
        # (algorithm/iterations/salt/hash).
        password = self.fields.get("password")
        if password is not None:
            password.help_text = ""
            password.widget.template_name = (
                "users/widgets/read_only_password_hash.html"
            )


class ManagedUserUpdateForm(forms.ModelForm):
    """Update form for the user-management page.

    Excludes password (changed via the dedicated password-reset flow, not
    a general profile edit) and excludes ``is_deleted`` (soft delete /
    restore have their own confirm actions on the management page).
    """

    groups = GROUPS_FIELD

    class Meta:
        model = User
        fields = ("username", "email", "is_active") + PROFILE_FIELDS + ("groups",)
        widgets = PROFILE_WIDGETS
