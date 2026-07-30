"""One-off repair for leads stranded by R9-7's sequential 2HR tail (R15-1).

While R9-7 was in force the 2HR tail ran ``5 → 6 → 7 → 8``, so a lead that
closed Task 5 during that window only ever opened Task 6 — Task 8 was opened
later, by the Accounts gate (Task 7). R15-1 restores the spec shape (TR §5 rows
6/8: both "Open after 5.6"), which means Task 5 now fans out to **6 and 8** and
Task 7 is terminal again.

Those two facts leave a gap for leads mid-flight across the change: they closed
Task 5 under the old routing (so no Task 8 row exists) but will close Task 7
under the new routing (which no longer opens one). Without this backfill such a
lead clears its reimbursement gate and is left with **no open task at all** — a
dead end with no way to record the client go-ahead.

This command finds those leads and opens their missing Task 8 through the normal
engine path, so assignee resolution, the stage/Project ID snapshot and the
checklist are all created exactly as a live fan-out would have made them.

Idempotent: a lead that already has a Task 8 row of any status is skipped, so
re-running is harmless. Use ``--dry-run`` to preview.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from leads import engine
from leads.models import Lead, Task


class Command(BaseCommand):
    help = "Open the missing Task 8 on leads stranded by the R9-7 → R15-1 routing change."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be opened without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        # Candidates: Task 5 closed (the fan-out point is behind them) but no
        # Task 8 row at all. Dropped/completed leads are left alone — there is
        # no go-ahead left to record on a lead that is no longer in play.
        candidates = (
            Lead.objects.filter(
                status=Lead.Status.IN_PROGRESS,
                tasks__task_no=5,
                tasks__status=Task.Status.CLOSED,
            )
            .exclude(tasks__task_no=8)
            .distinct()
            .order_by("id")
        )

        if not candidates:
            self.stdout.write("No stranded leads found — nothing to backfill.")
            return

        opened = 0
        for lead in candidates:
            wf = engine.active_workflow(lead.lead_type)
            if wf is None:
                self.stderr.write(f"Lead {lead.id}: no active workflow — skipped.")
                continue
            # Respect the lead's own flow: a flow that skips the 2HR body (so
            # Task 8 was never on its path) must not have one forced onto it.
            flow = engine._flow_for(lead, wf)
            if 8 in set(flow.get("skip", [])):
                self.stdout.write(f"Lead {lead.id}: Task 8 is skipped on its flow — left alone.")
                continue
            tdef = engine._task_defs(wf.workflow).get(8)
            if tdef is None:
                self.stderr.write(f"Lead {lead.id}: workflow has no Task 8 def — skipped.")
                continue

            label = f"lead {lead.id} ({lead.project_id or '-'})"
            if dry_run:
                self.stdout.write(f"Would open Task 8 on {label}.")
                opened += 1
                continue

            with transaction.atomic():
                task = engine.open_task(lead, tdef)
            self.stdout.write(f"Opened Task 8 (id={task.id}) on {label}, assigned to {task.assigned_to}.")
            opened += 1

        verb = "would be opened" if dry_run else "opened"
        self.stdout.write(self.style.SUCCESS(f"{opened} Task 8 row(s) {verb}."))
