"""Trigger scheduler — opens pending tasks whose offset date has arrived.

Implements the scheduled job of Tech Req §4.12 / PRD §5.6. Trigger tasks
(2/6/11/13/15) are created ``pending`` when their predecessor closes — unless
already due at that moment, in which case the engine opens them immediately.
This command evaluates the active ``WorkflowTriggerConfig`` rules and opens
each pending one where ``today >= reference_date - offset_days``.

**Run it frequently enough that a task opens on the same calendar day its
condition is met** — the docs require same-day (not next-day) opening. Wire it
to cron (or Celery beat) to run early each day, e.g.::

    # crontab — 06:00 daily
    0 6 * * *  cd /path/to/backend && .venv/bin/python manage.py open_due_tasks

Idempotent: a task is only ever opened once (it leaves ``pending``), so extra
runs are harmless.
"""

from django.core.management.base import BaseCommand

from leads import engine


class Command(BaseCommand):
    help = "Open pending trigger tasks whose date-offset condition is met (§4.12)."

    def handle(self, *args, **options):
        opened = engine.run_due_triggers()
        if not opened:
            self.stdout.write("No pending tasks are due to open.")
            return
        for task in opened:
            self.stdout.write(
                f"Opened task {task.task_no} ({task.task_name}) on lead {task.lead_id}."
            )
        self.stdout.write(self.style.SUCCESS(f"Opened {len(opened)} task(s)."))
