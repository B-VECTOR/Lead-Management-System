from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class Belt(models.Model):
    """A belt / grading level that can be assigned to users.

    Values are managed through the Django admin so the list can change
    without a code change or migration.
    """

    name = models.CharField(_("name"), max_length=50, unique=True)
    order = models.PositiveIntegerField(
        _("order"),
        default=0,
        help_text=_("Controls sort order; lower numbers rank first."),
    )

    class Meta:
        ordering = ["order", "name"]
        verbose_name = _("belt")
        verbose_name_plural = _("belts")

    def __str__(self):
        return self.name


mobile_validator = RegexValidator(
    regex=r"^\+?[0-9][0-9 \-]{6,19}$",
    message=_("Enter a valid mobile number (7–20 digits, an optional leading +)."),
)


class User(AbstractUser):
    """Custom user model that authenticates with an email instead of a username.

    All fields are mandatory (not null / not blank) except ``belt``,
    ``acting_belt_level``, and ``domain``, which are optional.
    """

    # Drop the username field inherited from AbstractUser.
    username = None
    email = models.EmailField(_("email address"), unique=True)

    # Single display-name field, replacing AbstractUser's first_name/last_name.
    first_name = None
    last_name = None
    name = models.CharField(_("name"), max_length=300)

    employee_id = models.CharField(_("employee ID"), max_length=20, unique=True)
    mobile_no = models.CharField(
        _("mobile number"), max_length=20, validators=[mobile_validator]
    )
    belt = models.ForeignKey(
        Belt,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name=_("belt"),
    )
    acting_belt_level = models.ForeignKey(
        Belt,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acting_users",
        verbose_name=_("acting belt level"),
    )
    domain = models.CharField(_("domain"), max_length=100, blank=True)
    date_of_joining = models.DateField(_("date of joining"))

    # Soft delete: kept separate from `is_active`, which can be used to
    # temporarily suspend an account without marking it as deleted.
    is_deleted = models.BooleanField(_("deleted"), default=False)

    USERNAME_FIELD = "email"
    # Prompted for by `createsuperuser` (email + password are always required).
    REQUIRED_FIELDS = [
        "name",
        "employee_id",
        "mobile_no",
        "date_of_joining",
    ]

    objects = UserManager()
    # Unfiltered manager: includes soft-deleted users. Use for the admin,
    # the "show deleted" management view, and restoring a deleted user.
    all_objects = models.Manager()

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self):
        return self.email

    # AbstractUser's defaults assemble first_name/last_name, which this model
    # no longer has; templates and admin call these, so point them at `name`.
    def get_full_name(self):
        return self.name

    def get_short_name(self):
        return self.name

    def soft_delete(self):
        """Mark this user deleted and block login, without removing the row."""
        self.is_deleted = True
        self.is_active = False
        self.save(update_fields=["is_deleted", "is_active"])

    def restore(self):
        """Reverse a soft delete."""
        self.is_deleted = False
        self.is_active = True
        self.save(update_fields=["is_deleted", "is_active"])
