"""Seed / refresh the BD workflow definition (Tech Req §5).

Idempotent, mirroring the ``seed_lookups`` / ``seed_reference`` pattern: keyed
on ``(name, type)`` via ``update_or_create`` so re-running simply syncs the
stored JSON to ``leads/workflow_data.py`` — the authoritative source — without
creating duplicates. Run after migrations to make the engine operational.
"""

from django.core.management.base import BaseCommand

from leads.models import Workflow
from leads.workflow_data import BD_WORKFLOW


class Command(BaseCommand):
    help = "Seed or refresh the BD workflow definition into the workflows table."

    def handle(self, *args, **options):
        obj, created = Workflow.objects.update_or_create(
            name=BD_WORKFLOW["name"],
            type=BD_WORKFLOW["type"],
            defaults={
                "workflow": BD_WORKFLOW,
                "status": Workflow.Status.ACTIVE,
            },
        )
        verb = "Created" if created else "Updated"
        task_count = len(BD_WORKFLOW.get("tasks", []))
        self.stdout.write(
            self.style.SUCCESS(f"{verb} '{obj.name}' ({obj.type}) — {task_count} tasks.")
        )
