"""Seed / refresh the date-offset trigger rules (Tech Req §4.12 / PRD §5.6).

Reads the ``trigger`` hints carried on tasks 2/6/11/13/15 in
``leads/workflow_data.py`` and materialises one :class:`WorkflowTriggerConfig`
row per hint against the seeded BD workflow. Idempotent, keyed on
``(workflow, task_no)`` via ``update_or_create`` — re-running syncs the
reference task/field and default offset without duplicating rows.

Run after ``seed_workflows`` (the workflow row must exist). Offsets are the
business-tunable part: any value already present in the hint is used
(Task 13 = 60 days per the docs' "2 months"); the rest default to 0 (open on
the reference date) and are meant to be adjusted from Django admin.
"""

from django.core.management.base import BaseCommand

from leads.models import Workflow, WorkflowTriggerConfig
from leads.workflow_data import BD_WORKFLOW


class Command(BaseCommand):
    help = "Seed or refresh the workflow trigger-config rows from the BD workflow hints."

    def handle(self, *args, **options):
        workflow = Workflow.objects.filter(
            name=BD_WORKFLOW["name"], type=BD_WORKFLOW["type"]
        ).first()
        if workflow is None:
            self.stderr.write(
                self.style.ERROR(
                    "BD workflow not found — run `seed_workflows` before `seed_trigger_config`."
                )
            )
            return

        count = 0
        for task in BD_WORKFLOW.get("tasks", []):
            trigger = task.get("trigger")
            if not trigger:
                continue
            WorkflowTriggerConfig.objects.update_or_create(
                workflow=workflow,
                task_no=task["task_no"],
                defaults={
                    "reference_task_no": trigger["reference_task_no"],
                    "reference_field_key": trigger["reference_field_key"],
                    "offset_days": trigger.get("offset_days", 0),
                    "is_active": True,
                },
            )
            count += 1

        self.stdout.write(
            self.style.SUCCESS(f"Synced {count} trigger config(s) for '{workflow.name}'.")
        )
