from django.db import models
from django.utils.translation import gettext_lazy as _


class ReferenceEntry(models.Model):
    """Shared shape for the Country / Industry / Area reference tables.

    Each is maintained as its own table (rather than a hardcoded choice list)
    so the business can add, rename, or recode entries from the Django admin
    without a code deployment (Tech Req §4.2). The ``code`` feeds Project ID
    generation (§13) and is read via the lead's FK, never re-typed elsewhere.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", _("active")
        INACTIVE = "inactive", _("inactive")

    name = models.CharField(_("name"), max_length=100, unique=True)
    code = models.CharField(_("code"), max_length=20, unique=True)
    # §4.2 v13: inactivating a row retires it from dropdowns without breaking
    # the existing (PROTECTed) FKs that reference it.
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.ACTIVE
    )

    class Meta:
        abstract = True
        ordering = ["name"]

    def __str__(self):
        return self.name


class Country(ReferenceEntry):
    class Meta(ReferenceEntry.Meta):
        verbose_name = _("country")
        verbose_name_plural = _("countries")


class Industry(ReferenceEntry):
    class Meta(ReferenceEntry.Meta):
        verbose_name = _("industry")
        verbose_name_plural = _("industries")


class Area(ReferenceEntry):
    """Also labeled "Domain" on the lead and user forms (Tech Req §4.2)."""

    class Meta(ReferenceEntry.Meta):
        verbose_name = _("area")
        verbose_name_plural = _("areas")
