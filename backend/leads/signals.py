"""Workflow-start trigger (Tech Req §4.3.1).

Task 1 opens when a lead's ``assigned_to`` transitions ``NULL → user`` — which
happens either at creation (Lead Manager picks an owner) or later (Lead Admin
assigns a Marketing-sourced lead). Implementing it on the field transition
(rather than only on create) covers both paths and also catches owner
assignment done from Django admin. ``start_workflow`` is itself idempotent, so
a redundant fire is harmless.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from . import engine
from .models import Lead


@receiver(pre_save, sender=Lead)
def _stash_previous_owner(sender, instance, **kwargs):
    """Remember the previously-saved owner so post_save can detect the change."""
    if not instance.pk:
        instance._previous_assigned_to_id = None
        return
    previous = sender.objects.filter(pk=instance.pk).values_list(
        "assigned_to_id", flat=True
    ).first()
    instance._previous_assigned_to_id = previous


@receiver(post_save, sender=Lead)
def _start_workflow_on_assignment(sender, instance, created, **kwargs):
    """Open Task 1 the moment the lead gains an owner."""
    previous = getattr(instance, "_previous_assigned_to_id", None)
    became_owned = instance.assigned_to_id and (created or previous is None)
    if became_owned:
        engine.start_workflow(instance)
