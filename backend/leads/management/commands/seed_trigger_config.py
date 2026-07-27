"""Seed / refresh the date-offset trigger rules (Tech Req §4.12 / PRD §5.6).

Reads the ``trigger`` hints carried on the trigger tasks (3/10/17/18/21/22 in the
v4.0/v17.0 graph) in ``leads/workflow_data.py`` and materialises the matching
:class:`WorkflowTriggerConfig` rows against the seeded BD workflow. Idempotent,
keyed on ``(workflow, task_no, condition_field_key)`` via ``update_or_create`` —
re-running syncs the reference task/field and default offsets without duplicating
rows.

Offsets are signed (positive = days *before* the reference date, negative =
days *after*) and are the business-tunable part (D8): the seed writes sensible
defaults from the hints; the business adjusts them from Django admin. Task 21
seeds **two** rows (its two-rule variant, §4.12): an unconditional default plus a
conditional row (shorter offset when the engagement duration is short).

Task 27's date-trigger is intentionally not seeded — Task 27 opens via branch
routing (Task 22-No / Task 12-13 moved-No / short-close), and a date trigger
would race that path (DD10); admin can add it later.

Run after ``seed_workflows`` (the workflow row must exist).
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
        seeded_keys = []  # (task_no, condition_field_key) pairs kept this run
        for task in BD_WORKFLOW.get("tasks", []):
            trigger = task.get("trigger")
            if not trigger:
                continue
            # The unconditional default rule.
            WorkflowTriggerConfig.objects.update_or_create(
                workflow=workflow,
                task_no=task["task_no"],
                condition_field_key="",
                defaults={
                    "reference_task_no": trigger["reference_task_no"],
                    "reference_field_key": trigger["reference_field_key"],
                    "offset_days": trigger.get("offset_days", 0),
                    "condition_max": None,
                    "is_active": True,
                },
            )
            seeded_keys.append((task["task_no"], ""))
            count += 1
            # Optional conditional rule (Task 21 two-rule variant): applies only
            # when the reference task's `field_key` value ≤ `max`.
            condition = trigger.get("condition")
            if condition:
                WorkflowTriggerConfig.objects.update_or_create(
                    workflow=workflow,
                    task_no=task["task_no"],
                    condition_field_key=condition["field_key"],
                    defaults={
                        "reference_task_no": trigger["reference_task_no"],
                        "reference_field_key": trigger["reference_field_key"],
                        "offset_days": condition.get("offset_days", trigger.get("offset_days", 0)),
                        "condition_max": condition["max"],
                        "is_active": True,
                    },
                )
                seeded_keys.append((task["task_no"], condition["field_key"]))
                count += 1

        # Prune configs left from a prior (e.g. the old 17-task) workflow so a
        # stale task_no can't wrongly gate a task in the current graph.
        stale = 0
        for cfg in WorkflowTriggerConfig.objects.filter(workflow=workflow):
            if (cfg.task_no, cfg.condition_field_key) not in seeded_keys:
                cfg.delete()
                stale += 1

        msg = f"Synced {count} trigger config(s) for '{workflow.name}'."
        if stale:
            msg += f" Pruned {stale} stale config(s)."
        self.stdout.write(self.style.SUCCESS(msg))
