import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .managers import UserManager


class Belt(models.Model):
    """A belt / grading level that can be assigned to users.

    Values are managed through the Django admin so the list can change
    without a code change or migration.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", _("active")
        INACTIVE = "inactive", _("inactive")

    name = models.CharField(_("name"), max_length=50, unique=True)
    order = models.PositiveIntegerField(
        _("order"),
        default=0,
        help_text=_("Controls sort order; lower numbers rank first."),
    )
    # §4.2 v13: only active belts are offered in the user-form dropdowns;
    # inactivating retires a belt without breaking existing user FKs.
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.ACTIVE
    )

    class Meta:
        ordering = ["order", "name"]
        verbose_name = _("belt")
        verbose_name_plural = _("belts")

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Custom user model.

    Authenticates by ``username`` (PRD §5.1 / Tech Req §4.1), with ``email``
    kept as a required field. ``username`` is inherited unchanged from
    ``AbstractUser`` (unique, required, 150 chars, standard validators).

    All fields are mandatory (not null / not blank) except ``belt``,
    ``acting_belt_level``, and ``domain``, which are optional.
    """

    email = models.EmailField(_("email address"), unique=True)

    # Single display-name field, replacing AbstractUser's first_name/last_name.
    first_name = None
    last_name = None
    name = models.CharField(_("name"), max_length=300)

    employee_id = models.PositiveIntegerField(
        _("employee ID"),
        unique=True,
        # §5.1 v14: duplicates are rejected with a friendly message (surfaced
        # by both the DRF serializer's UniqueValidator and the admin forms).
        error_messages={
            "unique": _("This Employee ID is already in use by another user.")
        },
    )
    mobile_no = models.CharField(
        _("mobile number"),
        max_length=10,
        validators=[
            RegexValidator(
                regex=r"^\d{10}$",
                message=_("Enter a valid 10-digit mobile number."),
            )
        ],
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
    domain = models.ForeignKey(
        "reference.Area",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name=_("domain"),
        help_text=_("Competency domain — shares the `areas` table (Tech Req §4.1)."),
    )
    date_of_joining = models.DateField(_("date of joining"))

    # Soft delete: kept separate from `is_active`, which can be used to
    # temporarily suspend an account without marking it as deleted.
    is_deleted = models.BooleanField(_("deleted"), default=False)

    USERNAME_FIELD = "username"
    # Prompted for by `createsuperuser` (username + password are always
    # required and so are excluded here).
    REQUIRED_FIELDS = [
        "email",
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


class PasswordResetToken(models.Model):
    """A single-use, time-limited token backing the forgot-password flow
    (Phase 8 — replaces the frontend's mocked reset).

    A row is created when a user requests a reset; the ``token`` UUID is the
    public handle placed in the reset link. It is valid until ``used`` or the
    30-minute TTL elapses. There is no email backend in this build, so the API
    returns the reset link directly in DEBUG (documented in the view).
    """

    TTL = timedelta(minutes=30)

    token = models.UUIDField(_("token"), default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
        verbose_name=_("user"),
    )
    used = models.BooleanField(_("used"), default=False)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("password reset token")
        verbose_name_plural = _("password reset tokens")

    def __str__(self):
        return f"reset[{self.user_id}] {self.token}"

    @property
    def is_valid(self):
        return not self.used and timezone.now() - self.created_at <= self.TTL
