"""End-to-end test suite for the v4.0/v17.0 rebuild (R8, PRD §7 / TR §4.0).

Rewritten from scratch — the pre-R1 suite tested the retired 17-task / Country
/ wide-allocation model and was left non-functional between R1 and R8 by design
(PLAN.md DD11: "a full workflow test rewrite is R8"). Exercises the real DRF
views (not just the engine) per role, per PLAN.md §3 Phase R8's checklist:
every ``flow_of_tasks`` flow, every ``lead_type``, Finance bounce loops, Mining
∥ Extension running in parallel, short-close, and the Task-8 auto-drop.
"""

import tempfile
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from reference.models import Area, Country, Industry

from . import engine, events, projects, resources, views
from .models import (
    ActivityLog,
    Attachment,
    Checklist,
    Followup,
    Lead,
    LeadStage,
    Notification,
    ResourceAllocation,
    Task,
    Workflow,
)
from .workflow_data import BD_WORKFLOW

User = get_user_model()

LIST_URL = "/api/leads/"
TODAY = date.today().isoformat()


def _past(days):
    return (date.today() - timedelta(days=days)).isoformat()


def detail_url(pk):
    return f"/api/leads/{pk}/"


class LeadApiTestBase(APITestCase):
    """Shared fixtures: reference rows and one user per role."""

    _seq = 0

    @classmethod
    def _make_user(cls, *group_names):
        cls._seq += 1
        n = cls._seq
        user = User.objects.create_user(
            username=f"user{n}",
            email=f"user{n}@example.com",
            password="pass1234",
            name=f"User {n}",
            employee_id=n,
            mobile_no=9000000000 + n,
            date_of_joining="2024-01-15",
        )
        for name in group_names:
            user.groups.add(Group.objects.get_or_create(name=name)[0])
        return user

    def setUp(self):
        self.country = Country.objects.create(name="India", code="IN")
        self.industry = Industry.objects.create(name="Pharma & Chemical", code="PH")
        self.area = Area.objects.create(name="NPD", code="NPD")
        self.area2 = Area.objects.create(name="Operations", code="OPS")

        self.lead_admin = self._make_user("lead_admin")
        self.lead_manager = self._make_user("lead_manager")
        self.other_manager = self._make_user("lead_manager")
        self.marketing = self._make_user("marketing")
        self.employee = self._make_user("employee")

    def base_payload(self, **overrides):
        data = {
            "company_name": "Acme Corp",
            "project_name": "Digital Transformation",
            "country": self.country.id,
            "industry": self.industry.id,
            "domain": self.area.id,
            "lead_type": Lead.LeadType.BD,
            "flow_of_tasks": Lead.FlowOfTasks.DEFAULT,
            "type_of_project": Lead.TypeOfProject.CONSULTING_FULL,
        }
        data.update(overrides)
        return data


class LeadCreateTests(LeadApiTestBase):
    def test_marketing_create_forces_not_assigned(self):
        self.client.force_authenticate(self.marketing)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(res.data["assigned_to"])
        self.assertEqual(res.data["status"], "In Progress")
        lead = Lead.objects.get(pk=res.data["id"])
        self.assertEqual(lead.created_by, self.marketing)
        # R2: base_code + initial stage still allocated even though nobody owns
        # it yet — the workflow itself only starts once an owner lands (signal).
        self.assertTrue(lead.base_code)
        self.assertFalse(lead.tasks.exists())

    def test_lead_manager_create_requires_owner(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(LIST_URL, self.base_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_to", res.data)

    def test_lead_manager_create_with_owner_starts_workflow(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["assigned_to"], self.lead_manager.id)
        self.assertEqual(res.data["created_by"], self.lead_manager.id)
        lead = Lead.objects.get(pk=res.data["id"])
        yy = f"{date.today().year % 100:02d}"
        # §13 (format finalized 2026-07-28): Country-Industry+Area+Type+YY+Seq.
        self.assertEqual(lead.base_code, f"IN-PHNPDCFF{yy}001")
        self.assertEqual(lead.stages.get().stage, LeadStage.BD)
        # No workflow is seeded in this test class (it only exercises the
        # create-permission/validation rules), so Task 1 doesn't open here —
        # the workflow classes below cover the real task-opening behaviour.

    def test_lead_admin_cannot_create(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.post(LIST_URL, self.base_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_cannot_create(self):
        self.client.force_authenticate(self.employee)
        res = self.client.post(LIST_URL, self.base_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_status_cannot_be_set_to_system_only(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id, status="Completed")
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)

    def test_type_of_project_required(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        payload.pop("type_of_project")
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("type_of_project", res.data)

    def test_flow_of_tasks_required_for_bd(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        payload.pop("flow_of_tasks")
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("flow_of_tasks", res.data)

    def test_flow_of_tasks_cleared_for_extension(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(
            assigned_to=self.lead_manager.id,
            lead_type=Lead.LeadType.EXTENSION,
            flow_of_tasks=Lead.FlowOfTasks.DEFAULT,
        )
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["flow_of_tasks"], "")

    def test_country_is_required(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        payload.pop("country")
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("country", res.data)

    def test_base_code_sequence_is_global_per_year(self):
        """The auto-generated number is one counter per year across all
        countries/industries/areas/types (decision 2026-07-28) — it used to
        restart per Area."""
        self.client.force_authenticate(self.lead_manager)
        first = self.client.post(
            LIST_URL, self.base_payload(assigned_to=self.lead_manager.id), format="json"
        ).data
        second = self.client.post(
            LIST_URL, self.base_payload(assigned_to=self.lead_manager.id), format="json"
        ).data
        other_area = self.client.post(
            LIST_URL,
            self.base_payload(
                assigned_to=self.lead_manager.id,
                domain=self.area2.id,
                type_of_project=Lead.TypeOfProject.AMC,
            ),
            format="json",
        ).data
        yy = f"{date.today().year % 100:02d}"
        self.assertEqual(Lead.objects.get(pk=first["id"]).base_code, f"IN-PHNPDCFF{yy}001")
        self.assertEqual(Lead.objects.get(pk=second["id"]).base_code, f"IN-PHNPDCFF{yy}002")
        # Different area + type, same global counter — no restart at 001.
        self.assertEqual(Lead.objects.get(pk=other_area["id"]).base_code, f"IN-PHOPSAMC{yy}003")

    def test_project_id_segments_follow_the_lead_classification(self):
        """Every segment is read off the lead: country, industry, area (domain),
        type of project — then the derived stage suffix (§13)."""
        self.client.force_authenticate(self.lead_manager)
        indonesia = Country.objects.create(name="Indonesia", code="ID")
        it = Industry.objects.create(name="Information Technology", code="IT")
        res = self.client.post(
            LIST_URL,
            self.base_payload(
                assigned_to=self.lead_manager.id,
                country=indonesia.id,
                industry=it.id,
                domain=self.area2.id,
                type_of_project=Lead.TypeOfProject.CONSULTING_LITE,
            ),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        yy = f"{date.today().year % 100:02d}"
        self.assertEqual(res.data["base_code"], f"ID-ITOPSCLNS{yy}001")
        # The stage of intervention is the trailing, derived segment.
        self.assertEqual(res.data["project_id_display"], f"ID-ITOPSCLNS{yy}001-BD")
        # …while lead.project_id stays the stable, suffix-free ID.
        self.assertEqual(res.data["project_id"], f"ID-ITOPSCLNS{yy}001")

    def test_project_id_is_frozen_when_the_classification_is_edited(self):
        """Editing country/industry/domain/type after creation deliberately does
        not rewrite the ID (decision 2026-07-28) — it is already printed on the
        lead's stage, task, allocation and activity rows."""
        self.client.force_authenticate(self.lead_manager)
        created = self.client.post(
            LIST_URL, self.base_payload(assigned_to=self.lead_manager.id), format="json"
        ).data
        original = created["base_code"]
        res = self.client.patch(
            detail_url(created["id"]),
            {"domain": self.area2.id, "type_of_project": Lead.TypeOfProject.AMC},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["base_code"], original)
        self.assertEqual(Lead.objects.get(pk=created["id"]).project_id, original)


class LeadVisibilityTests(LeadApiTestBase):
    def setUp(self):
        super().setUp()
        self.mkt_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Mkt Co", project_name="P1", created_by=self.marketing,
        )
        self.own_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Own Co", project_name="P2", created_by=self.lead_manager,
            assigned_to=self.lead_manager,
        )
        self.assigned_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Assigned Co", project_name="P3", created_by=self.other_manager,
            assigned_to=self.lead_manager,
        )

    def _ids(self, res):
        return {row["id"] for row in res.data["results"]}

    def test_lead_admin_sees_all(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), {self.mkt_lead.id, self.own_lead.id, self.assigned_lead.id})

    def test_lead_manager_sees_created_and_assigned(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), {self.own_lead.id, self.assigned_lead.id})

    def test_marketing_sees_only_created(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), {self.mkt_lead.id})

    def test_employee_sees_only_leads_assigned_to_them(self):
        self.client.force_authenticate(self.employee)
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), set())
        self.assigned_lead.assigned_to = self.employee
        self.assigned_lead.save(update_fields=["assigned_to"])
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), {self.assigned_lead.id})

    def test_employee_cannot_edit_assigned_lead(self):
        self.assigned_lead.assigned_to = self.employee
        self.assigned_lead.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.employee)
        res = self.client.patch(detail_url(self.assigned_lead.id), {"scope": "x"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_cannot_retrieve_out_of_scope_lead(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(detail_url(self.mkt_lead.id))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class LeadUpdateTests(LeadApiTestBase):
    def setUp(self):
        super().setUp()
        self.mkt_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Mkt Co", project_name="P1", created_by=self.marketing,
        )
        self.own_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Own Co", project_name="P2", created_by=self.lead_manager,
            assigned_to=self.lead_manager,
        )

    def test_marketing_can_edit_own_lead_fields(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.patch(detail_url(self.mkt_lead.id), {"scope": "New scope"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["scope"], "New scope")

    def test_marketing_cannot_assign_owner(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.patch(
            detail_url(self.mkt_lead.id), {"assigned_to": self.lead_manager.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_to", res.data)

    def test_lead_admin_assigns_owner_to_unassigned_lead(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.patch(
            detail_url(self.mkt_lead.id), {"assigned_to": self.lead_manager.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.mkt_lead.refresh_from_db()
        self.assertEqual(self.mkt_lead.assigned_to, self.lead_manager)

    def test_lead_admin_cannot_edit_already_assigned_lead(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.patch(detail_url(self.own_lead.id), {"scope": "hijack"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_manager_can_edit_own_lead(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(detail_url(self.own_lead.id), {"division": "West"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["division"], "West")

    def test_marketing_cannot_edit_others_lead(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.patch(detail_url(self.own_lead.id), {"scope": "x"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_guard_on_update(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(detail_url(self.own_lead.id), {"status": "Completed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)

    def test_direct_dropped_status_patch_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(detail_url(self.own_lead.id), {"status": "Dropped"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)

    def test_user_can_drop_lead_via_drop_endpoint(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(
            f"/api/leads/{self.own_lead.id}/drop/", {"remark": "Client backed out"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "Dropped")
        self.assertEqual(res.data["drop_remark"], "Client backed out")
        res = self.client.post(f"/api/leads/{self.own_lead.id}/drop/", format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_delete_endpoint(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.delete(detail_url(self.own_lead.id))
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class LeadAuthTests(LeadApiTestBase):
    def test_anonymous_denied(self):
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class AssignableUsersTests(LeadApiTestBase):
    URL = "/api/assignable-users/"

    def test_lists_only_lead_managers_and_employees(self):
        rm = self._make_user("resource_manager")
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data}
        self.assertEqual(ids, {self.lead_manager.id, self.other_manager.id, self.employee.id})
        self.assertNotIn(self.marketing.id, ids)
        self.assertNotIn(self.lead_admin.id, ids)
        self.assertNotIn(rm.id, ids)

    def test_marketing_forbidden(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_admin_allowed(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# --- The 28-task workflow engine (R8) ---------------------------------------


class WorkflowTestBase(LeadApiTestBase):
    """Seeds the real 28-task workflow + trigger config from the authoritative
    ``workflow_data.py`` (the same seed commands ``manage.py`` runs) and adds a
    resource-manager/finance/execution pool. Field-value builders below satisfy
    every task's mandatory fields via the "already due" trick — trigger
    reference dates are set to today (or far enough in the past) so a
    trigger-gated successor opens immediately rather than sitting ``pending``,
    keeping the walk tests deterministic without invoking the scheduler
    (exercised separately in :class:`TriggerSchedulerTests`).
    """

    def setUp(self):
        super().setUp()
        call_command("seed_workflows")
        call_command("seed_trigger_config")
        self.resource_manager = self._make_user("resource_manager")
        self.finance = self._make_user("finance")
        self.red = self._make_user("employee")
        self.brown = self._make_user("employee")
        self.white = self._make_user("employee")
        self.auditor1 = self._make_user("employee")
        self.auditor2 = self._make_user("employee")

    # -- lead / task plumbing ------------------------------------------------

    def create_lead(self, owner=None, **overrides):
        owner = owner or self.lead_manager
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=owner.id, **overrides)
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return Lead.objects.get(pk=res.data["id"])

    def task(self, lead, no, expect_status=Task.Status.OPEN):
        t = lead.tasks.filter(task_no=no).order_by("-id").first()
        self.assertIsNotNone(t, f"No instance of task {no} on lead {lead.id}")
        if expect_status is not None:
            self.assertEqual(t.status, expect_status, f"task {no} status")
        return t

    def complete(self, user, task_obj, fields=None, expect=status.HTTP_200_OK):
        task_obj.checklist_items.update(status=Checklist.Status.COMPLETE)
        self.client.force_authenticate(user)
        if fields:
            res = self.client.patch(
                f"/api/tasks/{task_obj.id}/", {"extra_fields": fields}, format="json"
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.post(f"/api/tasks/{task_obj.id}/complete/", format="json")
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def ensure_assignee(self, task_obj, user):
        """Reassign ``task_obj`` to ``user`` (via Lead Admin) if it isn't
        already — e.g. Task 23 on a fresh standalone Extension lead opens
        unassigned (no Execution Red has ever been allocated on it yet)."""
        if task_obj.assigned_to_id == user.id:
            return task_obj
        self.client.force_authenticate(self.lead_admin)
        res = self.client.post(
            f"/api/tasks/{task_obj.id}/reassign/", {"assigned_to": user.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task_obj.refresh_from_db()
        return task_obj

    def staff_and_submit(self, actor, task_obj, assignments, expect=status.HTTP_200_OK):
        """Fill each named slot on an allocation task, then submit it.

        R9: a single-occupancy slot may already be filled when the task opens —
        the Execution Red **carries forward** from the previous stage pre-filled
        (DD-R9-4) — so each assignment resolves to allocate (empty slot), a no-op
        (already the intended person), or reassign (a different person).
        """
        self.client.force_authenticate(actor)
        for slot, user in assignments.items():
            existing = ResourceAllocation.objects.filter(
                task=task_obj, slot=slot, status=ResourceAllocation.Status.ALLOCATED,
            ).first()
            if existing is not None and existing.user_id == user.id:
                continue
            if existing is not None:
                res = self.client.post(
                    f"/api/allocation-tasks/{task_obj.id}/reassign/",
                    {"allocation_id": existing.id, "user_id": user.id}, format="json",
                )
            else:
                res = self.client.post(
                    f"/api/allocation-tasks/{task_obj.id}/allocate/",
                    {"slot": slot, "user_id": user.id}, format="json",
                )
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.post(f"/api/allocation-tasks/{task_obj.id}/submit/", format="json")
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    # -- field-value builders (one per task; branch answers overridable) ----

    def f1(self, agreed="Yes"):
        return {"is_2hr_agreed": agreed}

    def f2(self, manpower="Yes"):
        d = {"expected_start_date": TODAY, "manpower_required": manpower}
        if manpower == "Yes":
            d.update(manpower_brown=1, manpower_white=2)
        return d

    def f5(self):
        return {"presentation_date": TODAY}

    def f6(self):
        return {"expected_receipt_date": TODAY}

    def f_gate(self, received="Yes", remark="Awaiting client payment"):
        d = {"payment_received": received}
        if received == "No":
            d["remark"] = remark
        return d

    def f8(self, go_ahead="Yes", blueprint="Yes"):
        d = {"go_ahead": go_ahead}
        if go_ahead == "Yes":
            d["solution_blueprint_required"] = blueprint
        return d

    def f9(self):
        return {
            "fee": 1000, "manpower_brown": 1, "manpower_white": 1,
            "expected_start_date": TODAY, "payment_tranches": 2,
        }

    def f12(self, re_pres="No", moved="Yes"):
        d = {"presentation_date": TODAY, "re_presentation_required": re_pres}
        if re_pres == "No":
            d["moved_to_next_stage"] = moved
        return d

    def f14(self):
        return {"expected_receipt_date": TODAY}

    def f16(self):
        return {
            "planned_start_date": TODAY, "period_months": 12, "planned_end_date": TODAY,
            "variable_fee_cap_total": 0, "variable_milestone_fee_cap": 0,
            "variable_performance_fee_cap": 0, "manpower_brown": 1, "manpower_white": 1,
        }

    def f20(self, actual_start=None, period_months=12, modified_end=None):
        return {
            "actual_start_date": actual_start or _past(200),
            "period_months": period_months,
            "modified_planned_end_date": modified_end or TODAY,
            "fixed_fee": 1000, "variable_fee_cap_total": 0,
            "variable_milestone_fee_cap": 0, "variable_performance_fee_cap": 0,
            "actual_fixed_fee_invoice_date": TODAY, "variable_fee_start_date": TODAY,
        }

    def f21(self, go_ahead="No"):
        return {"mining_go_ahead": go_ahead}

    def f0(self, flow="DEFAULT"):
        """The pre-flow selection task's answer (R19, Task 0)."""
        return {"flow_of_tasks": flow}

    def f22(self, approved="No"):
        return {"extension_approved": approved}

    def f23(self):
        return {
            "extended_start_date": TODAY, "period_months": 6, "planned_end_date": TODAY,
            "fixed_fee": 500, "variable_fee_cap_total": 0, "variable_milestone_fee_cap": 0,
            "variable_performance_fee_cap": 0, "manpower_brown": 1, "manpower_white": 1,
        }

    def f26(self):
        return {
            "actual_start_date": TODAY, "period_months": 6, "modified_planned_end_date": TODAY,
            "fixed_fee": 500, "variable_fee_cap_total": 0, "variable_milestone_fee_cap": 0,
            "variable_performance_fee_cap": 0, "actual_fixed_fee_invoice_date": TODAY,
            "variable_fee_start_date": TODAY,
        }

    def f27(self, final="Yes"):
        return {"final_closed": final}

    # -- shared walk fragments ------------------------------------------------

    def walk_to_task16(self, lead, owner, planned_start=None):
        """1 → 20 via the SnT branch (re-presentation No / moved Yes) — the
        common prefix shared by the full walk and the mining/extension tests.

        ``planned_start`` overrides Task 16's planned start date; a future one
        leaves Tasks 17/18 trigger-``pending`` (not yet due), which is the state
        the R12 advance-allocation tests need.
        """
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        self.complete(self.finance, self.task(lead, 7), self.f_gate("Yes"))
        self.complete(owner, self.task(lead, 8), self.f8("Yes", "Yes"))
        self.complete(owner, self.task(lead, 9), self.f9())
        self.staff_and_submit(self.resource_manager, self.task(lead, 10), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 11))
        self.complete(self.red, self.task(lead, 12), self.f12("No", "Yes"))
        self.complete(self.red, self.task(lead, 14), self.f14())
        self.complete(self.finance, self.task(lead, 15), self.f_gate("Yes"))
        f16 = self.f16()
        if planned_start:
            f16["planned_start_date"] = planned_start
        self.complete(owner, self.task(lead, 16), f16)

    def walk_17_to_20(self, lead, owner):
        """Task 16 closed → Task 20 closed: the Implementation tail, shared by
        the DEFAULT walk and the Direct-Proposal one (which enters at 16)."""
        self.staff_and_submit(self.resource_manager, self.task(lead, 17), {"execution_red": self.red})
        self.staff_and_submit(
            self.resource_manager, self.task(lead, 18),
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        self.complete(owner, self.task(lead, 19))
        self.complete(self.red, self.task(lead, 20), self.f20())

    def walk_to_task20(self, lead, owner):
        self.walk_to_task16(lead, owner)
        self.walk_17_to_20(lead, owner)

    def walk_to_task20_direct(self, lead, owner):
        """A ``DIRECT_PROPOSAL`` lead's walk: it enters at Task 16 (1–15 are
        pre-skipped), so only the Implementation tail runs."""
        self.complete(owner, self.task(lead, 16), self.f16())
        self.walk_17_to_20(lead, owner)

    def select_flow(self, lead, owner, flow="DEFAULT"):
        """Answer a spawned Mining lead's pre-flow selection task (R19)."""
        return self.complete(owner, self.task(lead, 0), self.f0(flow))


class FullFlowWalkTests(WorkflowTestBase):
    """Flow 1 (DEFAULT): the whole 1→28 path to a naturally-Completed lead,
    including both Finance gates answered Yes and both parallel Mining/
    Extension branches declined — R8's primary end-to-end walk."""

    def test_default_flow_to_completion(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task20(lead, owner)

        mining = self.task(lead, 21)
        extension = self.task(lead, 22)
        self.assertEqual(mining.stage.stage, LeadStage.MINING)
        self.assertEqual(extension.stage.stage, "E1")
        self.complete(owner, mining, self.f21("No"))
        self.complete(owner, extension, self.f22("No"))

        closure = self.task(lead, 27)
        self.assertTrue(closure.is_finance_gate is False)
        self.complete(self.red, closure, self.f27("Yes"))
        gate28 = self.task(lead, 28)
        self.complete(self.finance, gate28, self.f_gate("Yes"))

        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.COMPLETE)
        # project_details snapshot recorded at Task 20's close (§4.8).
        self.assertTrue(lead.project_details.filter(stage__stage=LeadStage.IM).exists())
        # Tasks 13/23-26 never happened on this path — skipped, not missing.
        self.assertEqual(self.task(lead, 13, expect_status=Task.Status.SKIPPED).status, "skipped")
        # The main-sequence stages have all closed behind the lead; the 2HR
        # stage waited on its parallel 6/7 money branch before doing so (D11).
        for code in (LeadStage.BD, LeadStage.TWO_HR, LeadStage.SNT, LeadStage.IM):
            self.assertEqual(
                lead.stages.get(stage=code).status, LeadStage.Status.CLOSED, code
            )

    def test_finance_can_only_see_and_work_gates(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task16(lead, owner)
        # Task 7/15 gates are already closed (Yes) by walk_to_task16; check a
        # fresh one instead — Task 17's allocation task is not a gate, so
        # Finance can neither view nor edit it.
        alloc17 = self.task(lead, 17)
        self.client.force_authenticate(self.finance)
        res = self.client.get(f"/api/tasks/{alloc17.id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        # But the Accounts queue only ever lists open gates.
        res = self.client.get("/api/finance-gates/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])


class FlowVariantTests(WorkflowTestBase):
    """Flows 2–4 (§4.3.4/D6): the 2HR→Proposal branch-skip, Direct Proposal's
    pre-materialized skip, and SnT→Proposal's entry edge."""

    def test_two_hr_proposal_flow_skips_snt_via_blueprint_no(self):
        lead = self.create_lead(flow_of_tasks=Lead.FlowOfTasks.TWO_HR_PROPOSAL)
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        self.complete(self.finance, self.task(lead, 7), self.f_gate("Yes"))
        self.complete(owner, self.task(lead, 8), self.f8("Yes", "No"))
        self.task(lead, 16)  # opened directly
        for no in (9, 10, 11, 12, 13, 14, 15):
            self.assertEqual(self.task(lead, no, expect_status=None).status, "skipped")

    def test_direct_proposal_flow_enters_at_16(self):
        lead = self.create_lead(flow_of_tasks=Lead.FlowOfTasks.DIRECT_PROPOSAL)
        self.task(lead, 16)  # the only open task
        for no in range(1, 16):
            self.assertEqual(self.task(lead, no, expect_status=None).status, "skipped")

    def test_snt_proposal_flow_edges_task_2_straight_to_9(self):
        lead = self.create_lead(flow_of_tasks=Lead.FlowOfTasks.SNT_PROPOSAL)
        owner = self.lead_manager
        for no in (3, 4, 5, 6, 7, 8):
            self.assertEqual(self.task(lead, no, expect_status=None).status, "skipped")
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2(manpower="No"))
        self.task(lead, 9)  # edge override, bypassing the (skipped) 2HR body


class AutoDropTests(WorkflowTestBase):
    """Task 8 "go-ahead = No" auto-drops the lead and opens no successors (§5.5).

    R15-1 restored the parallel 2HR tail (5.6 fans out to **6 and 8**), which
    makes §5.5's real shape reachable again: the drop leaves the money branch
    (6 and its Accounts gate 7) open so the reimbursement is still chased after
    the lead dies. The auto-drop must still not behave like a manual drop — it
    flips only the lead's status, touching no task rows and opening nothing.
    """

    def walk_to_the_fan_out(self, lead, owner):
        """Drive the lead to the 5.6 fan-out, leaving 6 and 8 both open. Returns
        Task 5's completion response so callers can assert on what it opened."""
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        return self.complete(self.red, self.task(lead, 5), self.f5())

    def test_task_5_opens_6_and_8_together(self):
        """R15-1 / TR §5 rows 6 & 8 — both say "Opens after 5.6", so closing
        Task 5 fans out to the money branch and the go-ahead simultaneously."""
        lead = self.create_lead()
        res = self.walk_to_the_fan_out(lead, self.lead_manager)

        opened = sorted(t["task_no"] for t in res.get("opened_tasks", []))
        self.assertEqual(opened, [6, 8], "5.6 must fan out to both 6 and 8")
        self.task(lead, 6, expect_status=Task.Status.OPEN)
        self.task(lead, 8, expect_status=Task.Status.OPEN)

    def test_go_ahead_no_drops_lead_leaving_the_money_branch_open(self):
        """§5.5 proper: the drop does not touch the parallel money branch, so
        Task 6 (and after it, gate 7) can still collect the reimbursement."""
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_the_fan_out(lead, owner)
        res = self.complete(owner, self.task(lead, 8), self.f8("No"))

        self.assertEqual(res.get("opened_tasks", []), [], "the No branch opens nothing")
        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.DROPPED)
        # Unlike a manual drop (which sweeps open/held tasks to `dropped`), the
        # auto-drop leaves every task row exactly as the flow left it — Task 6 is
        # still open on a dropped lead, which is the whole point of §5.5.
        self.task(lead, 6, expect_status=Task.Status.OPEN)
        self.assertFalse(
            lead.tasks.filter(status=Task.Status.DROPPED).exists(),
            "an auto-drop must not cascade onto task rows",
        )
        self.assertIn(
            "dropped",
            ActivityLog.objects.filter(lead=lead, type="status").latest("id").summary.lower(),
        )
        # The money is still chaseable after the drop: 6 closes and still opens
        # its Accounts gate, exactly as it would on a live lead.
        self.complete(self.red, self.task(lead, 6), self.f6())
        self.task(lead, 7, expect_status=Task.Status.OPEN)

    def test_the_money_branch_gate_does_not_re_open_task_8(self):
        """R15-1 removed Task 7's forward edge to 8 (TR §5 row 7: "Yes → close").
        Task 8 is already in flight from the 5.6 fan-out, so the gate clearing
        must not open a second instance of it — nor must a gate bounce disturb it.
        """
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_the_fan_out(lead, owner)
        original_8 = self.task(lead, 8)

        self.complete(self.red, self.task(lead, 6), self.f6())
        self.complete(self.finance, self.task(lead, 7), self.f_gate("No"))
        self.task(lead, 6, expect_status=Task.Status.OPEN)  # bounced to chase the money
        self.assertEqual(
            lead.tasks.filter(task_no=8).count(), 1, "a bounce must not duplicate Task 8"
        )
        self.task(lead, 8, expect_status=Task.Status.OPEN)  # untouched by the bounce

        self.complete(self.red, self.task(lead, 6), self.f6())
        res = self.complete(self.finance, self.task(lead, 7), self.f_gate("Yes"))
        self.assertEqual(
            res.get("opened_tasks", []), [], "the cleared gate is terminal — 8 already exists"
        )
        self.assertEqual(lead.tasks.filter(task_no=8).count(), 1)
        self.assertEqual(self.task(lead, 8).id, original_8.id, "the same Task 8 row all along")


class FinanceGateBounceTests(WorkflowTestBase):
    """Finance gate "No" re-opens the preceding money task (§5.10) — the
    sanctioned closed→open exception — and the loop can repeat."""

    def test_bounce_reopens_task_and_reuses_the_same_gate_row(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        gate = self.task(lead, 7)
        self.complete(self.finance, gate, self.f_gate("No", "Still waiting on the client"))

        task6_reopened = self.task(lead, 6, expect_status=Task.Status.OPEN)
        self.assertEqual(task6_reopened.reopened_count, 1)
        self.assertEqual(Task.objects.filter(lead=lead, task_no=6).count(), 1)
        self.assertEqual(Task.objects.filter(lead=lead, task_no=7).count(), 1, "gate row reused, not duplicated")
        bounce_log = ActivityLog.objects.filter(
            lead=lead, type="task", summary__contains="re-opened"
        ).latest("id")
        self.assertIn("re-opened", bounce_log.summary)
        self.assertEqual(bounce_log.body, "Still waiting on the client")

        self.complete(self.red, task6_reopened, self.f6())
        gate_reopened = self.task(lead, 7, expect_status=Task.Status.OPEN)
        self.assertEqual(gate_reopened.reopened_count, 1)
        self.complete(self.finance, gate_reopened, self.f_gate("Yes"))
        self.assertEqual(self.task(lead, 8, expect_status=Task.Status.OPEN).status, "open")

    def test_only_finance_can_answer_a_gate(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        gate = self.task(lead, 7)
        self.client.force_authenticate(owner)
        res = self.client.patch(
            f"/api/tasks/{gate.id}/", {"extra_fields": self.f_gate("Yes")}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, res.data)


class MiningSpawnTests(WorkflowTestBase):
    """Task 21 "go-ahead = Yes" spawns a standalone Mining child lead sharing
    the parent's ``base_code`` and running its own cycle (§5.3.1/§13, R6). R19:
    the child starts on the pre-flow selection task (Task 0) — it has no
    ``flow_of_tasks`` until that is answered."""

    def test_mining_go_ahead_spawns_child_lead(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task20(lead, owner)
        mining_task = self.task(lead, 21)
        self.complete(owner, mining_task, self.f21("Yes"))

        child = Lead.objects.get(parent_lead=lead)
        self.assertEqual(child.lead_type, Lead.LeadType.MINING)
        self.assertEqual(child.base_code, lead.base_code)
        self.assertEqual(child.assigned_to, lead.assigned_to)
        # Its only task is the flow gate, in the mining marker stage — no BD
        # stage and no workflow tasks exist yet (R19).
        self.assertEqual(child.tasks.get().task_no, 0)
        self.assertEqual(child.tasks.get().stage.stage, "M")
        self.assertEqual(child.flow_of_tasks, "")
        self.assertFalse(child.stages.filter(stage="BD").exists())

        self.select_flow(child, owner, Lead.FlowOfTasks.DEFAULT)
        child.refresh_from_db()
        self.assertEqual(child.flow_of_tasks, Lead.FlowOfTasks.DEFAULT)
        self.assertEqual(self.task(child, 1).task_no, 1)
        self.assertTrue(projects.derived_project_id(child).endswith("-M-BD"))
        # Stored project_id snapshots (2026-07-27): each stage/task row carries
        # its own ID string in the DB, matching the per-stage derived value.
        child_bd_stage = child.stages.get(stage="BD")
        self.assertEqual(
            child_bd_stage.project_id,
            projects.project_id_for_stage(child, "BD"),
        )
        self.assertTrue(child_bd_stage.project_id.endswith("-M-BD"))
        self.assertEqual(self.task(child, 1).project_id, child_bd_stage.project_id)
        self.assertIn(
            "Mining",
            ActivityLog.objects.filter(lead=lead, type="lead").latest("id").summary,
        )

        # The child runs completely independently of the parent's own Task 22.
        self.complete(owner, self.task(lead, 22), self.f22("No"))
        self.complete(owner, self.task(child, 1), self.f1())
        self.assertEqual(self.task(child, 2, expect_status=Task.Status.OPEN).lead_id, child.id)

    def test_mining_spawn_alerts_the_actor_and_the_lead_managers(self):
        """Going into Mining is announced, not silent: the Task-21 response
        carries the new lead so the UI can alert the user mid-flow, and a bell
        notification reaches the new lead's owner + the parent's managers."""
        owner = self.other_manager  # created_by stays self.lead_manager
        lead = self.create_lead(owner=owner)
        self.walk_to_task20(lead, owner)
        res = self.complete(owner, self.task(lead, 21), self.f21("Yes"))

        child = Lead.objects.get(parent_lead=lead)
        spawned = res["spawned_lead"]
        self.assertEqual(spawned["id"], child.id)
        self.assertEqual(spawned["lead_type"], Lead.LeadType.MINING)
        self.assertEqual(spawned["project_id"], projects.derived_project_id(child))
        self.assertEqual(spawned["assigned_to_name"], owner.name)
        self.assertEqual(spawned["link"], f"/leads/{child.id}")

        notes = Notification.objects.filter(type=Notification.Type.LEAD_ASSIGNED, link=spawned["link"])
        # The child's owner is told even though they are the actor (it's new work
        # for them); the parent's creator is told as a manager; nobody twice.
        self.assertEqual(
            set(notes.values_list("user", flat=True)),
            {owner.id, self.lead_manager.id},
        )
        self.assertEqual(notes.count(), 2)
        self.assertIn("gone into Mining", notes.first().message)
        # The alert names the task that actually opened — the flow gate (R19).
        self.assertIn("Select Flow of Tasks", notes.first().message)
        self.assertEqual(spawned["first_task_no"], 0)
        self.assertTrue(spawned["awaiting_flow_selection"])

    def test_mining_window_open_is_announced_to_owner_and_managers(self):
        """Task 21 opening (the lead entering its Mining stage) replaces the
        generic "a task is ready" note with a mining-specific one, sent to the
        assignee *and* the lead's owner/creator — it fires off a trigger months
        after go-live, so nobody is watching for it."""
        owner = self.other_manager  # created_by stays self.lead_manager
        lead = self.create_lead(owner=owner)
        self.walk_to_task20(lead, owner)  # Task 20 is closed by the Execution Red
        task21 = self.task(lead, 21)

        notes = Notification.objects.filter(message__startswith="Mining window open")
        expected = {task21.assigned_to_id, owner.id, self.lead_manager.id} - {None}
        self.assertEqual(set(notes.values_list("user", flat=True)), expected)
        self.assertEqual(notes.count(), len(expected))
        self.assertFalse(
            Notification.objects.filter(message__contains="“Exploit Mining Opportunities” is ready for you").exists(),
            "the mining announcement replaces the generic task-open note",
        )
        # The frontend flags the stage change off the workflow marker, not task 21.
        self.client.force_authenticate(owner)
        res = self.client.get(f"/api/tasks/{task21.id}/")
        self.assertTrue(res.data["is_mining_opportunity"])
        self.assertFalse(self.client.get(f"/api/tasks/{self.task(lead, 22).id}/").data["is_mining_opportunity"])

    def test_spawned_mining_lead_does_not_inherit_the_parents_flow(self):
        """R19 / the reported bug: a Direct-Proposal parent used to hand its flow
        to the Mining child, which then entered at Task 16 with Tasks 1–15
        pre-skipped. The child must instead start on the flow gate with nothing
        skipped, and run whatever is chosen there — here the full path."""
        lead = self.create_lead(flow_of_tasks=Lead.FlowOfTasks.DIRECT_PROPOSAL)
        owner = self.lead_manager
        self.walk_to_task20_direct(lead, owner)
        res = self.complete(owner, self.task(lead, 21), self.f21("Yes"))

        child = Lead.objects.get(parent_lead=lead)
        self.assertEqual(child.flow_of_tasks, "")
        self.assertEqual([t.task_no for t in child.tasks.all()], [0])
        spawned = res["spawned_lead"]
        self.assertEqual(spawned["first_task_no"], 0)
        self.assertEqual(spawned["first_task_name"], "Select Flow of Tasks")
        self.assertTrue(spawned["awaiting_flow_selection"])

        self.select_flow(child, owner, Lead.FlowOfTasks.DEFAULT)
        self.task(child, 1)  # the full path, not the parent's Direct Proposal
        self.assertFalse(
            child.tasks.filter(status=Task.Status.SKIPPED).exists(),
            "the parent's Direct-Proposal skips must not reach the child",
        )

    def test_flow_selection_answer_drives_the_childs_entry_task(self):
        """The chosen flow — not the parent's — decides where the child enters:
        Direct Proposal here, off a DEFAULT parent."""
        lead = self.create_lead()
        owner = self.lead_manager
        self.assertEqual(lead.flow_of_tasks, Lead.FlowOfTasks.DEFAULT)
        self.walk_to_task20(lead, owner)
        self.complete(owner, self.task(lead, 21), self.f21("Yes"))

        child = Lead.objects.get(parent_lead=lead)
        res = self.select_flow(child, owner, Lead.FlowOfTasks.DIRECT_PROPOSAL)
        child.refresh_from_db()

        self.assertEqual(child.flow_of_tasks, Lead.FlowOfTasks.DIRECT_PROPOSAL)
        self.assertEqual([t["task_no"] for t in res["opened_tasks"]], [16])
        self.task(child, 16)
        for no in range(1, 16):
            self.assertEqual(self.task(child, no, expect_status=None).status, "skipped")
        # Answerable from the history: why this Mining lead started at Task 16.
        self.assertIn(
            "Direct Proposal",
            ActivityLog.objects.filter(lead=child, type="lead").latest("id").summary,
        )

    def test_flow_selection_task_needs_a_valid_flow_before_it_closes(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task20(lead, owner)
        self.complete(owner, self.task(lead, 21), self.f21("Yes"))
        child = Lead.objects.get(parent_lead=lead)
        gate = self.task(child, 0)

        # Nothing chosen → the task stays open and no workflow task exists.
        self.complete(owner, gate, expect=status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.task(child, 0).id, gate.id)
        self.assertEqual(child.tasks.count(), 1)

        # An off-list value is rejected at save time — the `choice` option list
        # is enforced server-side, not merely offered by the UI.
        self.client.force_authenticate(owner)
        res = self.client.patch(
            f"/api/tasks/{gate.id}/",
            {"extra_fields": {"flow_of_tasks": "NOT_A_FLOW"}},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)

        self.select_flow(child, owner, Lead.FlowOfTasks.SNT_PROPOSAL)
        child.refresh_from_db()
        self.assertEqual(child.flow_of_tasks, Lead.FlowOfTasks.SNT_PROPOSAL)
        self.task(child, 1)

    def test_manually_created_mining_lead_has_no_flow_gate(self):
        """The gate is for BD→Mining conversions only: a Mining lead created by
        hand already carries the flow its creator picked, so it starts on the
        workflow itself."""
        lead = self.create_lead(
            lead_type=Lead.LeadType.MINING, flow_of_tasks=Lead.FlowOfTasks.DEFAULT
        )
        self.assertEqual([t.task_no for t in lead.tasks.all()], [1])
        self.assertFalse(lead.tasks.filter(task_no=0).exists())

    def test_declined_mining_spawns_nothing_and_alerts_nobody(self):
        lead = self.create_lead(owner=self.other_manager)
        self.walk_to_task20(lead, self.other_manager)
        res = self.complete(self.other_manager, self.task(lead, 21), self.f21("No"))
        self.assertNotIn("spawned_lead", res)
        self.assertFalse(Lead.objects.filter(parent_lead=lead).exists())


class ExtensionLoopTests(WorkflowTestBase):
    """An Extension-type lead is standalone (own ``base_code``, no
    ``parent_lead``) and enters at Task 22 in stage E1 (D10); the loop can run
    more than once, incrementing E1 → E2 (R6)."""

    def test_extension_lead_is_standalone_and_enters_at_22(self):
        lead = self.create_lead(lead_type=Lead.LeadType.EXTENSION, flow_of_tasks="")
        self.assertIsNone(lead.parent_lead)
        self.assertEqual(lead.flow_of_tasks, "")
        self.assertEqual(self.task(lead, 22).stage.stage, "E1")
        for no in range(1, 22):
            self.assertFalse(lead.tasks.filter(task_no=no).exists())

    def test_extension_loop_advances_e1_to_e2_and_snapshots_each_cycle(self):
        lead = self.create_lead(lead_type=Lead.LeadType.EXTENSION, flow_of_tasks="")
        owner = self.lead_manager

        self.complete(owner, self.task(lead, 22), self.f22("Yes"))
        task23 = self.task(lead, 23)
        self.assertEqual(task23.stage.stage, "E1")
        # Fresh standalone Extension lead — no Execution Red has ever been
        # allocated on it, so Task 23 opens unassigned; hand it to the Red.
        self.complete(self.red, self.ensure_assignee(task23, self.red), self.f23())
        self.staff_and_submit(self.resource_manager, self.task(lead, 24), {"execution_red": self.red})
        self.staff_and_submit(
            self.resource_manager, self.task(lead, 25),
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        task26_e1 = self.task(lead, 26)
        self.assertEqual(task26_e1.stage.stage, "E1")
        self.complete(self.red, task26_e1, self.f26())

        self.assertEqual(lead.stages.get(stage="E1").status, LeadStage.Status.CLOSED)
        self.assertTrue(
            lead.project_details.filter(stage__stage="E1").exists(),
            "Task 26 close snapshots the closing E1 cycle",
        )
        # can_short_close is granted the moment Task 26 first opens, and stays
        # granted through the loop-back (R6, DD-R6-5).
        self.assertTrue(engine.can_short_close(lead))

        # R8 finding (documented in PLAN.md): Task 22's seeded trigger config
        # always references Task 20's end date (§4.12) — a standalone
        # Extension-type lead (D10) never has a Task 20, so on a genuine
        # lead_type=Extension lead the loop-back can never resolve a
        # reference date and the new Task 22 instance sits `pending`
        # indefinitely under the default config. Admin can unblock it today by
        # deactivating that WorkflowTriggerConfig row (D8) — no code change —
        # but the default doesn't fit this entry path. Asserting the current,
        # imperfect behaviour here rather than a wrong "it just works" claim.
        loop_back = self.task(lead, 22, expect_status=Task.Status.PENDING)
        engine.open_pending_task(loop_back)  # simulate the admin/data workaround
        loop_back.refresh_from_db()
        self.assertEqual(loop_back.stage.stage, "E2", "loop-back opens the next E{n}")
        self.complete(owner, loop_back, self.f22("No"))
        self.assertEqual(self.task(lead, 27).status, "open")


class MiningExtensionParallelTests(WorkflowTestBase):
    """Mining and Extension can be live on the same lead family at once — a
    spawned Mining child never blocks the parent's own Extension loop, and
    vice versa (R8: "mining ∥ extension")."""

    def test_mining_child_and_parent_extension_progress_independently(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task20(lead, owner)
        self.complete(owner, self.task(lead, 21), self.f21("Yes"))
        child = Lead.objects.get(parent_lead=lead)
        # The child's own path is chosen on its flow gate first (R19); until then
        # only its ``M`` marker stage is open.
        self.assertEqual(child.stages.filter(status=LeadStage.Status.IN_PROGRESS).count(), 1)  # M
        self.select_flow(child, owner, Lead.FlowOfTasks.DEFAULT)

        # Open the parent's Extension loop instead of declining it.
        self.complete(owner, self.task(lead, 22), self.f22("Yes"))
        self.assertEqual(lead.stages.filter(status=LeadStage.Status.IN_PROGRESS, stage="E1").count(), 1)
        self.assertEqual(child.stages.filter(status=LeadStage.Status.IN_PROGRESS).count(), 2)  # M + BD

        # Both lines of work move independently.
        self.complete(self.red, self.task(lead, 23), self.f23())
        self.complete(owner, self.task(child, 1), self.f1())
        self.assertEqual(self.task(child, 2, expect_status=Task.Status.OPEN).lead_id, child.id)
        self.assertEqual(self.task(lead, 24, expect_status=Task.Status.OPEN).lead_id, lead.id)


class ShortCloseTests(WorkflowTestBase):
    """Short-close (§9.2/§5.12, R6): a Resource-Manager action, available once
    Task 20 or Task 26 has ever opened (widened from 26-only by the user on
    2026-07-30), that jumps straight to Project Closure."""

    def _lead_at_open_extension_implementation(self):
        lead = self.create_lead(lead_type=Lead.LeadType.EXTENSION, flow_of_tasks="")
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 22), self.f22("Yes"))
        task23 = self.task(lead, 23)
        self.complete(self.red, self.ensure_assignee(task23, self.red), self.f23())
        self.staff_and_submit(self.resource_manager, self.task(lead, 24), {"execution_red": self.red})
        self.staff_and_submit(
            self.resource_manager, self.task(lead, 25),
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        return lead, owner

    def test_short_close_sweeps_open_tasks_and_reaches_completed(self):
        lead, owner = self._lead_at_open_extension_implementation()
        open_task26 = self.task(lead, 26)

        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/leads/{lead.id}/short-close/", {"remark": "Client ending early"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        open_task26.refresh_from_db()
        self.assertEqual(open_task26.status, "skipped")
        self.assertTrue(open_task26.short_closed)
        closure = self.task(lead, 27)
        lead.refresh_from_db()
        self.assertTrue(lead.short_close_remark)
        self.assertIsNotNone(lead.short_closed_at)

        self.complete(self.red, closure, self.f27("Yes"))
        self.complete(self.finance, self.task(lead, 28), self.f_gate("Yes"))
        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.COMPLETE)
        # No project_details row for the cut-short cycle — its commercials were
        # never finalized (Task 26 never closed normally).
        self.assertFalse(lead.project_details.exists())

    def test_short_close_requires_a_remark_and_rm_role(self):
        lead, owner = self._lead_at_open_extension_implementation()
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(f"/api/leads/{lead.id}/short-close/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(owner)
        res = self.client.post(
            f"/api/leads/{lead.id}/short-close/", {"remark": "x"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_short_close_unavailable_before_implementation_ever_opened(self):
        lead = self.create_lead()
        self.assertFalse(engine.can_short_close(lead))
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/leads/{lead.id}/short-close/", {"remark": "too early"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_grant_arrives_with_task_20_and_not_before(self):
        """The widened grant (user, 2026-07-30): available from the moment
        Implementation opens, through the extension loop, and never during the
        BD/pre-sale stages before it."""
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task16(lead, owner)
        # Deep in the BD path, engagement not live yet — still no access.
        self.assertFalse(engine.can_short_close(lead))

        self.staff_and_submit(self.resource_manager, self.task(lead, 17), {"execution_red": self.red})
        self.staff_and_submit(
            self.resource_manager, self.task(lead, 18),
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        self.complete(owner, self.task(lead, 19))
        self.task(lead, 20)  # Implementation is open
        self.assertTrue(engine.can_short_close(lead))

    def test_short_close_mid_implementation_sweeps_and_opens_closure(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task16(lead, owner)
        self.staff_and_submit(self.resource_manager, self.task(lead, 17), {"execution_red": self.red})
        self.staff_and_submit(
            self.resource_manager, self.task(lead, 18),
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        self.complete(owner, self.task(lead, 19))
        implementation = self.task(lead, 20)

        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/leads/{lead.id}/short-close/",
            {"remark": "Client pulled the plug mid-implementation"}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        implementation.refresh_from_db()
        self.assertEqual(implementation.status, "skipped")
        self.assertTrue(implementation.short_closed)
        # The IM stage is closed with no project_details row — Task 20 never
        # closed, so its commercials were never finalized.
        self.assertEqual(lead.stages.get(stage=LeadStage.IM).status, LeadStage.Status.CLOSED)
        self.assertFalse(lead.project_details.exists())

        closure = self.task(lead, 27)
        self.complete(self.red, closure, self.f27("Yes"))
        self.complete(self.finance, self.task(lead, 28), self.f_gate("Yes"))
        lead.refresh_from_db()
        self.assertEqual(lead.status, Lead.Status.COMPLETE)

    def test_pending_grant_task_does_not_unlock_short_close(self):
        """A seeded-but-unopened Task 26 is waiting on its date trigger — the
        docs grant access "on open", so it must not count."""
        lead, owner = self._lead_at_open_extension_implementation()
        task26 = self.task(lead, 26)
        Task.objects.filter(pk=task26.pk).update(status=Task.Status.PENDING)
        self.assertFalse(engine.can_short_close(lead))


class ResourceAllocationApiTests(WorkflowTestBase):
    """Append-only allocation slots (R5, §4.7): allocate/reassign/release, the
    D12 co-permission (Resource Manager or the lead's BD owner), and the
    auditor-vs-team mandatory-slot distinction."""

    def test_rm_and_bd_owner_can_work_the_task_outsider_cannot(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        alloc = self.task(lead, 3)

        self.client.force_authenticate(self.other_manager)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/",
            {"slot": "execution_red", "user_id": self.red.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.staff_and_submit(owner, alloc, {"execution_red": self.red})
        self.task(lead, 4)  # the successor opened
        self.assertEqual(resources.latest_execution_red(lead), self.red)

    def test_reassign_execution_red_cascades_open_tasks(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        alloc = self.task(lead, 3)
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})
        task4 = self.task(lead, 4)
        self.complete(owner, task4)
        task5 = self.task(lead, 5)
        self.assertEqual(task5.assigned_to_id, self.red.id)

        current = ResourceAllocation.objects.get(
            task=alloc, slot="execution_red", status="allocated"
        )
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/reassign/",
            {"allocation_id": current.id, "user_id": self.brown.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task5.refresh_from_db()
        self.assertEqual(task5.assigned_to_id, self.brown.id, "open task follows the new Red")
        note = Notification.objects.filter(user=self.brown, type="task_reassigned").first()
        self.assertIsNotNone(note)

    def test_auditor_task_requires_both_auditor_slots(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task16(lead, owner)
        gate18 = self.task(lead, 18)
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(f"/api/allocation-tasks/{gate18.id}/submit/", format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.staff_and_submit(
            self.resource_manager, gate18, {"auditor_1": self.auditor1, "auditor_2": self.auditor2}
        )

    def test_over_under_allocation_indicator_from_manpower(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2(manpower="Yes"))  # white=2
        alloc = self.task(lead, 3)
        self.client.force_authenticate(self.resource_manager)

        def _row():
            listing = self.client.get(f"/api/allocation-tasks/?lead={lead.id}")
            self.assertEqual(listing.status_code, status.HTTP_200_OK)
            return next(r for r in listing.data if r["id"] == alloc.id)

        self.assertEqual(_row()["allocation"]["required"]["white"], 2)
        self.assertEqual(len(_row()["allocation"]["occupants"]["white"]), 0)
        self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/",
            {"slot": "white", "user_id": self.white.id}, format="json",
        )
        self.assertEqual(len(_row()["allocation"]["occupants"]["white"]), 1)


class ExecutionRedContinuityTests(WorkflowTestBase):
    """R9-2/R9-5: the Execution Red is mandatory on every stage, carries forward
    pre-filled into later allocation tasks, can never be emptied, and sees every
    step of its lead."""

    def _to_first_allocation(self, manpower="Yes"):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2(manpower=manpower))
        return lead, owner, self.task(lead, 3)

    def test_task_3_opens_for_the_resource_manager_when_manpower_is_required(self):
        lead, _owner, alloc = self._to_first_allocation(manpower="Yes")
        self.assertIsNone(alloc.assigned_to_id, "staffed from the resource queue")
        self.client.force_authenticate(self.resource_manager)
        listing = self.client.get("/api/allocation-tasks/")
        self.assertIn(alloc.id, [r["id"] for r in listing.data])
        # …and the Resource Manager can open the lead itself (§5.4 "he can see
        # all the lead details too").
        self.assertEqual(
            self.client.get(detail_url(lead.id)).status_code, status.HTTP_200_OK
        )

    def test_task_3_still_opens_for_the_bd_owner_when_no_manpower_is_required(self):
        """R9-5 (DD-R9-3): "No" no longer skips the allocation — it hands it to
        the lead's Default BD Person, so a Red is allocated either way."""
        lead, owner, alloc = self._to_first_allocation(manpower="No")
        self.assertEqual(alloc.status, Task.Status.OPEN)
        self.assertEqual(alloc.assigned_to_id, owner.id)
        self.staff_and_submit(owner, alloc, {"execution_red": self.red})
        self.assertEqual(resources.latest_execution_red(lead), self.red)
        self.assertEqual(self.task(lead, 4).status, Task.Status.OPEN)

    def test_red_carries_forward_prefilled_into_the_next_allocation_task(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        self.complete(self.finance, self.task(lead, 7), self.f_gate("Yes"))
        self.complete(owner, self.task(lead, 8), self.f8("Yes", "Yes"))
        self.complete(owner, self.task(lead, 9), self.f9())

        alloc10 = self.task(lead, 10)
        row = ResourceAllocation.objects.filter(
            task=alloc10, slot="execution_red", status="allocated"
        ).first()
        self.assertIsNotNone(row, "the Red must open pre-filled, not empty")
        self.assertEqual(row.user_id, self.red.id)
        # Pre-filled means immediately submittable — no re-picking the same person.
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(f"/api/allocation-tasks/{alloc10.id}/submit/", format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_execution_red_cannot_be_released_to_empty(self):
        lead, _owner, alloc = self._to_first_allocation()
        self.client.force_authenticate(self.resource_manager)
        self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/",
            {"slot": "execution_red", "user_id": self.red.id}, format="json",
        )
        row = ResourceAllocation.objects.get(task=alloc, slot="execution_red")
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/release/",
            {"allocation_id": row.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resources.latest_execution_red(lead), self.red)

    def test_resource_manager_sees_the_allocation_step_and_nothing_else(self):
        """R10-1(b), retained through R12-1: the *backend* still scopes an
        allocation lead and its allocation steps to the Resource Manager — the
        resource module's own endpoints depend on it — even though R12-1 took the
        Leads *tab* away again and staffing moved into `/resources`. Their other
        steps stay hidden (they are not the lead's owner or Red)."""
        lead, _owner, alloc = self._to_first_allocation()
        self.client.force_authenticate(self.resource_manager)
        listing = self.client.get(LIST_URL)
        self.assertIn(
            lead.id, [r["id"] for r in listing.data["results"]], "lead must be listed"
        )

        res = self.client.get(f"/api/leads/{lead.id}/tasks/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = {r["task_no"]: r for r in res.data}
        self.assertIn(3, rows, "the allocation step must be visible")
        self.assertTrue(rows[3]["can_staff"], "and staffable in place (D12)")
        self.assertNotIn(2, rows, "non-allocation steps stay hidden")

        # And the staffing actually works from there — same endpoints the inline
        # AllocationStep calls.
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})
        self.assertEqual(resources.latest_execution_red(lead), self.red)

    def test_resource_manager_cannot_edit_a_lead_from_the_leads_list(self):
        """The new tab is read-only for them — LeadPermission is unchanged."""
        lead, _owner, _alloc = self._to_first_allocation()
        self.client.force_authenticate(self.resource_manager)
        res = self.client.patch(detail_url(lead.id), {"project_name": "Renamed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_red_sees_every_step_of_the_lead(self):
        lead, owner, alloc = self._to_first_allocation()
        # Before allocation the Red is an outsider to this lead.
        self.client.force_authenticate(self.red)
        self.assertEqual(
            self.client.get(detail_url(lead.id)).status_code, status.HTTP_404_NOT_FOUND
        )
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})

        self.client.force_authenticate(self.red)
        self.assertEqual(self.client.get(detail_url(lead.id)).status_code, status.HTTP_200_OK)
        res = self.client.get(f"/api/leads/{lead.id}/tasks/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        seen = {r["task_no"] for r in res.data}
        # Every step, not just the ones assigned to them (Task 1/2 were the BD
        # owner's, Task 3 opened unassigned).
        self.assertTrue({1, 2, 3}.issubset(seen), seen)

    def test_red_keeps_access_after_the_stage_releases_the_allocation(self):
        """D11 releases the 2HR Red when the stage closes — that must not revoke
        their visibility, and an ``execution_red`` task must still resolve to
        them (DD-R9-5)."""
        lead, owner, alloc = self._to_first_allocation()
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})
        ResourceAllocation.objects.filter(lead=lead, slot="execution_red").update(
            status=ResourceAllocation.Status.RELEASED
        )
        self.assertEqual(resources.latest_execution_red(lead), self.red)
        self.client.force_authenticate(self.red)
        self.assertEqual(self.client.get(detail_url(lead.id)).status_code, status.HTTP_200_OK)


class RestoredNamedSlotTests(WorkflowTestBase):
    """R12-2/R12-3: Auditors 3–4 and Project Members 1–10 are back as slots, are
    optional, and are the Resource Manager's alone — to see and to fill."""

    def _to_team_allocation(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        return lead, owner, self.task(lead, 3)

    def _slots(self, actor, task_obj, lead):
        self.client.force_authenticate(actor)
        res = self.client.get(f"/api/allocation-tasks/?lead={lead.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row = next(r for r in res.data if r["id"] == task_obj.id)
        return row["allocation"]

    def test_team_task_offers_the_ten_project_member_slots_to_the_rm_only(self):
        lead, owner, alloc = self._to_team_allocation()

        rm_alloc = self._slots(self.resource_manager, alloc, lead)
        self.assertIn("project_member_1", rm_alloc["slots"])
        self.assertIn("project_member_10", rm_alloc["slots"])
        self.assertEqual(
            rm_alloc["slot_labels"]["project_member_1"], "Project Member 1"
        )
        # Optional: required 0, so an empty one is neither under-allocation nor a
        # submit blocker.
        self.assertEqual(rm_alloc["required"]["project_member_1"], 0)

        owner_alloc = self._slots(owner, alloc, lead)
        self.assertEqual(
            owner_alloc["slots"], ["execution_red", "execution_brown", "white"],
            "the lead's Default BD Person keeps Red/Brown/White only",
        )
        self.assertNotIn("project_member_1", owner_alloc["required"])

    def test_auditor_task_offers_four_auditor_slots(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.walk_to_task16(lead, owner)
        gate18 = self.task(lead, 18)
        alloc = self._slots(self.resource_manager, gate18, lead)
        self.assertEqual(
            alloc["slots"], ["auditor_1", "auditor_2", "auditor_3", "auditor_4"]
        )
        # 1–2 mandatory (required 1), 3–4 optional extras (required 0).
        self.assertEqual(alloc["required"]["auditor_2"], 1)
        self.assertEqual(alloc["required"]["auditor_4"], 0)
        # Submitting with only the mandatory pair filled still works.
        self.staff_and_submit(
            self.resource_manager, gate18,
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )

    def test_only_the_resource_manager_can_fill_a_named_extra(self):
        lead, owner, alloc = self._to_team_allocation()
        payload = {"slot": "project_member_1", "user_id": self.white.id}

        # The BD owner may staff this task (D12) but not that slot.
        self.client.force_authenticate(owner)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/", payload, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn("Resource Manager", str(res.data))

        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/", payload, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row = ResourceAllocation.objects.get(task=alloc, slot="project_member_1")
        self.assertEqual(row.user_id, self.white.id)
        self.assertEqual(row.names, self.white.name, "denormalized name snapshot")

        # …and the BD owner cannot reassign or release it either.
        self.client.force_authenticate(owner)
        for action, body in (
            ("reassign", {"allocation_id": row.id, "user_id": self.brown.id}),
            ("release", {"allocation_id": row.id}),
        ):
            res = self.client.post(
                f"/api/allocation-tasks/{alloc.id}/{action}/", body, format="json"
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, action)

    def test_lead_resources_tab_hides_the_named_extras(self):
        lead, owner, alloc = self._to_team_allocation()
        self.client.force_authenticate(self.resource_manager)
        for slot, who in (("execution_red", self.red), ("project_member_1", self.white)):
            res = self.client.post(
                f"/api/allocation-tasks/{alloc.id}/allocate/",
                {"slot": slot, "user_id": who.id}, format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        url = f"/api/leads/{lead.id}/resource-allocations/"
        self.client.force_authenticate(owner)
        slots = {r["slot"] for r in self.client.get(url).data}
        self.assertIn("execution_red", slots)
        self.assertNotIn("project_member_1", slots, "extras stay out of the lead tab")

        self.client.force_authenticate(self.resource_manager)
        slots = {r["slot"] for r in self.client.get(url).data}
        self.assertIn("project_member_1", slots)


class AdvanceAuditorAllocationTests(WorkflowTestBase):
    """R12-4: the auditors can be allocated before Task 18 is due, and the task
    then completes itself when it opens (``auto_close_when_staffed``)."""

    def _pending_task_18(self):
        lead = self.create_lead()
        owner = self.lead_manager
        future = (date.today() + timedelta(days=30)).isoformat()
        self.walk_to_task16(lead, owner, planned_start=future)
        return lead, self.task(lead, 18, expect_status=Task.Status.PENDING)

    def _allocate_auditors(self, task_obj):
        self.client.force_authenticate(self.resource_manager)
        for slot, who in (("auditor_1", self.auditor1), ("auditor_2", self.auditor2)):
            res = self.client.post(
                f"/api/allocation-tasks/{task_obj.id}/allocate/",
                {"slot": slot, "user_id": who.id}, format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_pending_auditor_task_is_listed_and_staffable_in_advance(self):
        lead, gate18 = self._pending_task_18()
        self.client.force_authenticate(self.resource_manager)
        # The queue's "To do" filter spans open + pending, so it is reachable.
        res = self.client.get("/api/allocation-tasks/?status=open,pending")
        row = next(r for r in res.data if r["id"] == gate18.id)
        self.assertTrue(row["can_staff"])
        self.assertTrue(row["auto_closes_when_staffed"])
        self.assertIsNotNone(row["scheduled_open"], "the UI shows when it opens")
        self._allocate_auditors(gate18)
        gate18.refresh_from_db()
        self.assertEqual(gate18.status, Task.Status.PENDING, "still not due")

    def test_task_18_closes_itself_when_it_opens_already_staffed(self):
        lead, gate18 = self._pending_task_18()
        self._allocate_auditors(gate18)

        opened = engine.open_pending_task(gate18)  # the scheduler's action
        self.assertEqual(opened.status, Task.Status.CLOSED)
        self.assertTrue(
            ActivityLog.objects.filter(
                lead=lead, summary__contains="closed automatically"
            ).exists()
        )
        self.assertFalse(
            Notification.objects.filter(
                user=self.resource_manager, message__contains=gate18.task_name
            ).exists(),
            "no 'allocation needed' ping for work that was already done",
        )

    def test_task_18_opens_and_waits_when_the_auditors_were_not_pre_allocated(self):
        lead, gate18 = self._pending_task_18()
        opened = engine.open_pending_task(gate18)
        self.assertEqual(opened.status, Task.Status.OPEN)
        self.assertTrue(
            Notification.objects.filter(
                user=self.resource_manager, message__contains=gate18.task_name
            ).exists(),
            "the Resource Manager is told it needs staffing",
        )
        # It then closes the ordinary way, by submitting it.
        self.staff_and_submit(
            self.resource_manager, opened,
            {"auditor_1": self.auditor1, "auditor_2": self.auditor2},
        )
        opened.refresh_from_db()
        self.assertEqual(opened.status, Task.Status.CLOSED)


class MidEngagementReassignmentTests(WorkflowTestBase):
    """R12-5: a submitted (closed) allocation task's slots stay changeable — for
    the Resource Manager, for as long as the allocation is live."""

    def _closed_allocation(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        alloc = self.task(lead, 3)
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})
        alloc.refresh_from_db()
        self.assertEqual(alloc.status, Task.Status.CLOSED)
        return lead, owner, alloc

    def test_rm_can_swap_the_red_after_submitting_and_the_work_follows(self):
        lead, owner, alloc = self._closed_allocation()
        task4 = self.task(lead, 4)
        self.complete(owner, task4)
        task5 = self.task(lead, 5)
        self.assertEqual(task5.assigned_to_id, self.red.id)

        current = ResourceAllocation.objects.get(
            task=alloc, slot="execution_red", status=ResourceAllocation.Status.ALLOCATED
        )
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/reassign/",
            {"allocation_id": current.id, "user_id": self.brown.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task5.refresh_from_db()
        self.assertEqual(task5.assigned_to_id, self.brown.id, "the handover cascades")
        current.refresh_from_db()
        self.assertEqual(current.status, ResourceAllocation.Status.RELEASED)
        self.assertEqual(
            ResourceAllocation.objects.get(replaces=current).user_id, self.brown.id
        )

    def test_the_bd_owner_cannot_change_slots_once_the_task_is_closed(self):
        lead, owner, alloc = self._closed_allocation()
        current = ResourceAllocation.objects.get(
            task=alloc, slot="execution_red", status=ResourceAllocation.Status.ALLOCATED
        )
        self.client.force_authenticate(owner)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/reassign/",
            {"allocation_id": current.id, "user_id": self.brown.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_skipped_allocation_task_is_nobody_s_to_staff(self):
        lead, owner, alloc = self._closed_allocation()
        alloc.status = Task.Status.SKIPPED
        alloc.save(update_fields=["status"])
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(
            f"/api/allocation-tasks/{alloc.id}/allocate/",
            {"slot": "execution_brown", "user_id": self.brown.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class LeadReassignmentCascadeTests(WorkflowTestBase):
    """R9-4: reassigning a lead moves the work, not just the label."""

    def test_open_task_follows_the_new_owner(self):
        lead = self.create_lead()
        owner = self.lead_manager
        task1 = self.task(lead, 1)
        self.assertEqual(task1.assigned_to_id, owner.id)

        # The managing Lead Manager reassigns their own lead (LeadPermission:
        # Lead Admin may only touch a still-unassigned one).
        self.client.force_authenticate(owner)
        res = self.client.patch(
            detail_url(lead.id),
            {"assigned_to": self.other_manager.id, "remark": "Owner on leave"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        task1.refresh_from_db()
        self.assertEqual(
            task1.assigned_to_id, self.other_manager.id,
            "the task in flight moves with the lead, completed or not",
        )
        # …and the edit right moves with it: the outgoing owner can no longer close it.
        self.client.force_authenticate(owner)
        res = self.client.post(f"/api/tasks/{task1.id}/complete/", format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            Notification.objects.filter(user=self.other_manager, type="task_reassigned").exists()
        )

    def test_cascade_leaves_the_execution_reds_own_tasks_alone(self):
        """DD-R9-7: a task the workflow assigns to the Execution Red belongs to
        them as Red — a lead-owner change must not quietly strip it."""
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        self.complete(owner, self.task(lead, 2), self.f2())
        self.staff_and_submit(self.resource_manager, self.task(lead, 3), {"execution_red": self.red})
        self.complete(owner, self.task(lead, 4))
        task5 = self.task(lead, 5)
        self.assertEqual(task5.assigned_to_id, self.red.id)

        # Make the Red the lead owner too, then hand the lead on. Each PATCH is
        # made by the lead's current Lead-Manager owner (see above).
        self.client.force_authenticate(owner)
        res = self.client.patch(detail_url(lead.id), {"assigned_to": self.red.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        res = self.client.patch(
            detail_url(lead.id), {"assigned_to": self.other_manager.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task5.refresh_from_db()
        self.assertEqual(task5.assigned_to_id, self.red.id, "Task 5 is the Red's, as Red")


class TriggerSchedulerTests(WorkflowTestBase):
    """Date-offset trigger tasks open ``pending`` until their reference date
    arrives (§4.12) — the scheduler command opens them same-day."""

    def test_pending_task_opens_only_once_its_offset_date_arrives(self):
        lead = self.create_lead()
        owner = self.lead_manager
        self.complete(owner, self.task(lead, 1), self.f1())
        # Reference date 10 days out — Task 3's offset is 0, so it is not due yet.
        future = (date.today() + timedelta(days=10)).isoformat()
        self.complete(owner, self.task(lead, 2), self.f2(manpower="Yes") | {"expected_start_date": future})
        pending = self.task(lead, 3, expect_status=Task.Status.PENDING)

        call_command("open_due_tasks")
        pending.refresh_from_db()
        self.assertEqual(pending.status, "pending", "not due yet")

        engine.run_due_triggers(today=date.today() + timedelta(days=10))
        pending.refresh_from_db()
        self.assertEqual(pending.status, "open")
        self.assertIsNotNone(pending.task_start_dt)


class HoldAndDropRemarkTests(WorkflowTestBase):
    """Hold/unhold remarks cascade lead→task and surface on the lead banner
    (§4.9/§6, Tech Req v16)."""

    def test_hold_lead_cascades_to_open_tasks_with_remark(self):
        lead = self.create_lead()
        owner = self.lead_manager
        task1 = self.task(lead, 1)
        self.client.force_authenticate(owner)
        res = self.client.post(
            f"/api/leads/{lead.id}/hold/", {"remark": "Client unavailable"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "Hold")
        self.assertEqual(res.data["active_hold"]["reason"], "Client unavailable")
        task1.refresh_from_db()
        self.assertEqual(task1.status, "hold")

        res = self.client.post(f"/api/leads/{lead.id}/unhold/", {"remark": "Back online"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "In Progress")
        task1.refresh_from_db()
        self.assertEqual(task1.status, "open")


class AuditTrailTests(WorkflowTestBase):
    """PRD §7: every notable action is timestamped and attributable to a user.
    Confirms the ``ActivityLog`` trail (not just DB timestamp columns — see
    PLAN.md's R8 audit-columns note) for creation, completion, hold, a Finance
    re-open, and a resource action."""

    def test_actions_are_logged_attributable_and_timestamped(self):
        lead = self.create_lead()
        owner = self.lead_manager
        created = ActivityLog.objects.filter(lead=lead, type="lead").earliest("id")
        self.assertEqual(created.summary, "Lead created")
        self.assertEqual(created.actor, owner)
        self.assertIsNotNone(created.created_at)

        self.complete(owner, self.task(lead, 1), self.f1())
        completed = ActivityLog.objects.filter(
            lead=lead, type="task", summary__contains="completed"
        ).latest("id")
        self.assertIn("completed", completed.summary)
        self.assertEqual(completed.actor, owner)

        self.complete(owner, self.task(lead, 2), self.f2())
        alloc = self.task(lead, 3)
        self.staff_and_submit(self.resource_manager, alloc, {"execution_red": self.red})
        resource_log = ActivityLog.objects.filter(lead=lead, type="resource").latest("id")
        self.assertEqual(resource_log.actor, self.resource_manager)

        self.complete(owner, self.task(lead, 4))
        self.complete(self.red, self.task(lead, 5), self.f5())
        self.complete(self.red, self.task(lead, 6), self.f6())
        gate = self.task(lead, 7)
        self.complete(self.finance, gate, self.f_gate("No", "chasing payment"))
        bounce_log = ActivityLog.objects.filter(
            lead=lead, type="task", summary__contains="re-opened"
        ).latest("id")
        self.assertEqual(bounce_log.actor, self.finance)
        self.assertIn("re-opened", bounce_log.summary)
        self.assertEqual(self.task(lead, 6).reopened_count, 1)


# --- Follow-ups / attachments / notifications / dashboard --------------------


class FollowupApiTestBase(LeadApiTestBase):
    FOLLOWUPS_URL = "/api/followups/"
    ASSIGNEES_URL = "/api/followup-assignees/"

    def setUp(self):
        super().setUp()
        self.lead = Lead.objects.create(
            company_name="Acme Corp", project_name="Digital Transformation",
            country=self.country, industry=self.industry, domain=self.area, lead_type=Lead.LeadType.BD,
            assigned_to=self.lead_manager, created_by=self.lead_manager,
        )
        self.future = (timezone.now().date() + timedelta(days=5)).isoformat()

    def followup_payload(self, **overrides):
        data = {
            "lead": self.lead.id, "title": "Call the client",
            "assigned_to": self.employee.id, "followup_date": self.future,
            "remark": "Confirm the kickoff date.",
        }
        data.update(overrides)
        return data


class FollowupCreateTests(FollowupApiTestBase):
    def test_lead_manager_creates_followup(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["created_by"], self.lead_manager.id)
        self.assertEqual(res.data["status"], "open")

    def test_status_forced_open_on_create(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(status="done"), format="json")
        self.assertEqual(res.data["status"], "open")

    def test_past_followup_date_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        past = (timezone.now().date() - timedelta(days=1)).isoformat()
        res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(followup_date=past), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_viewer_cannot_create(self):
        for user in (self.marketing, self.employee):
            self.client.force_authenticate(user)
            res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(), format="json")
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_task_worker_can_create_followup(self):
        Task.objects.create(
            lead=self.lead, task_no=1, assigned_to=self.employee, status=Task.Status.OPEN
        )
        self.client.force_authenticate(self.employee)
        res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)


class FollowupVisibilityTests(FollowupApiTestBase):
    def setUp(self):
        super().setUp()
        self.followup = Followup.objects.create(
            lead=self.lead, title="Call the client", assigned_to=self.employee,
            created_by=self.lead_manager, followup_date=self.future,
        )

    def _ids(self, res):
        data = res.data["results"] if isinstance(res.data, dict) else res.data
        return [f["id"] for f in data]

    def test_assignee_sees_own_followup(self):
        self.client.force_authenticate(self.employee)
        res = self.client.get(self.FOLLOWUPS_URL + "?assigned_to_me=1")
        self.assertIn(self.followup.id, self._ids(res))

    def test_unrelated_user_sees_nothing(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.get(self.FOLLOWUPS_URL)
        self.assertNotIn(self.followup.id, self._ids(res))


class FollowupUpdateTests(FollowupApiTestBase):
    def setUp(self):
        super().setUp()
        self.followup = Followup.objects.create(
            lead=self.lead, title="Call the client", assigned_to=self.employee,
            created_by=self.lead_manager, followup_date=self.future,
        )

    def test_assignee_marks_done(self):
        self.client.force_authenticate(self.employee)
        res = self.client.patch(f"/api/followups/{self.followup.id}/", {"status": "done"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_comment_thread_add_and_list(self):
        self.client.force_authenticate(self.employee)
        url = f"/api/followups/{self.followup.id}/updates/"
        add = self.client.post(url, {"comment": "Left a voicemail."}, format="json")
        self.assertEqual(add.status_code, status.HTTP_201_CREATED, add.data)
        listing = self.client.get(url)
        comments = listing.data if isinstance(listing.data, list) else listing.data["results"]
        self.assertEqual(len(comments), 1)


class SimpleLeadTestBase(LeadApiTestBase):
    """One owned lead with its Task 1 auto-opened — the minimal fixture the
    attachment/notification/dashboard tests need (no full workflow seed)."""

    def setUp(self):
        super().setUp()
        Workflow.objects.create(
            name=BD_WORKFLOW["name"], type=BD_WORKFLOW["type"], workflow=BD_WORKFLOW,
        )
        self.lead = Lead.objects.create(
            company_name="WF Co", project_name="WF Project",
            country=self.country, industry=self.industry, domain=self.area,
            flow_of_tasks=Lead.FlowOfTasks.DEFAULT, type_of_project=Lead.TypeOfProject.AMC,
            created_by=self.lead_manager, assigned_to=self.lead_manager,
        )

    def open_task(self, task_no):
        return self.lead.tasks.filter(task_no=task_no, status=Task.Status.OPEN).order_by("-id").first()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AttachmentTests(SimpleLeadTestBase):
    def _upload(self, content=b"hello", name="doc.txt", title="Contract"):
        return self.client.post(
            f"/api/leads/{self.lead.id}/attachments/",
            {"file": SimpleUploadedFile(name, content), "title": title},
            format="multipart",
        )

    def test_upload_and_list(self):
        self.client.force_authenticate(self.lead_manager)
        res = self._upload()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        listing = self.client.get(f"/api/leads/{self.lead.id}/attachments/")
        self.assertEqual(len(listing.data), 1)

    def test_oversize_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        big = b"x" * (5 * 1024 * 1024 + 1)
        res = self._upload(content=big, name="big.bin")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_delete_but_other_manager_cannot(self):
        self.client.force_authenticate(self.lead_manager)
        att_id = self._upload().data["id"]
        self.client.force_authenticate(self.other_manager)
        res = self.client.delete(f"/api/attachments/{att_id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.delete(f"/api/attachments/{att_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Attachment.objects.filter(id=att_id).exists())


class NotificationTests(SimpleLeadTestBase):
    def test_reassign_notifies_target(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(
            f"/api/tasks/{task1.id}/reassign/", {"assigned_to": self.employee.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        note = Notification.objects.filter(user=self.employee).first()
        self.assertIsNotNone(note)
        self.assertEqual(note.type, Notification.Type.TASK_REASSIGNED)

    def test_mark_all_read_scoped_to_caller(self):
        Notification.objects.create(user=self.employee, type="followup", message="a")
        Notification.objects.create(user=self.employee, type="followup", message="b")
        Notification.objects.create(user=self.lead_manager, type="followup", message="c")
        self.client.force_authenticate(self.employee)
        res = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(res.data["updated"], 2)

    def test_cannot_mark_others_notification(self):
        note = Notification.objects.create(user=self.lead_manager, type="followup", message="x")
        self.client.force_authenticate(self.employee)
        res = self.client.post(f"/api/notifications/{note.id}/read/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class NotificationFeedTests(SimpleLeadTestBase):
    """The feed is bounded: paginated, filterable, and self-pruning."""

    def _make(self, count, *, read=False, user=None):
        for i in range(count):
            Notification.objects.create(
                user=user or self.employee,
                type="followup",
                message=f"note {i}",
                is_read=read,
            )

    def test_list_is_paginated_and_carries_unread_count(self):
        self._make(25)
        self.client.force_authenticate(self.employee)
        res = self.client.get("/api/notifications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 20)
        self.assertEqual(res.data["count"], 25)
        self.assertEqual(res.data["unread_count"], 25)
        self.assertIsNotNone(res.data["next"])

    def test_page_size_is_honoured_and_capped(self):
        self._make(30)
        self.client.force_authenticate(self.employee)
        res = self.client.get("/api/notifications/?page_size=6")
        self.assertEqual(len(res.data["results"]), 6)
        # An oversized request cannot pull the whole table back.
        self.assertEqual(views.NotificationPagination.max_page_size, 100)
        res = self.client.get("/api/notifications/?page_size=500")
        self.assertLessEqual(len(res.data["results"]), 100)

    def test_unread_filter_still_reports_full_unread_count(self):
        self._make(3, read=True)
        self._make(2)
        self.client.force_authenticate(self.employee)
        res = self.client.get("/api/notifications/?unread=1")
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(res.data["unread_count"], 2)
        res_all = self.client.get("/api/notifications/")
        self.assertEqual(res_all.data["count"], 5)
        self.assertEqual(res_all.data["unread_count"], 2)

    def test_clear_read_deletes_only_read_and_only_own(self):
        self._make(3, read=True)
        self._make(2)
        self._make(4, read=True, user=self.lead_manager)
        self.client.force_authenticate(self.employee)
        res = self.client.post("/api/notifications/clear-read/")
        self.assertEqual(res.data["deleted"], 3)
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 2)
        self.assertEqual(Notification.objects.filter(user=self.lead_manager).count(), 4)

    def test_old_read_notifications_are_pruned_on_list(self):
        from django.core.cache import cache

        cache.clear()  # the prune is throttled once/hour per user
        self._make(1, read=True)
        self._make(1)
        stale = timezone.now() - timedelta(days=views.NOTIFICATION_RETENTION_DAYS + 1)
        Notification.objects.filter(user=self.employee).update(created_at=stale)
        self.client.force_authenticate(self.employee)
        res = self.client.get("/api/notifications/")
        # The read one aged out; the unread one is kept regardless of age.
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["unread_count"], 1)

    def test_duplicate_unread_notification_is_collapsed(self):
        events.notify(self.employee, "followup", "same message", "/leads/1")
        events.notify(self.employee, "followup", "same message", "/leads/1")
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 1)
        # Once read, a repeat is a genuinely new alert again.
        Notification.objects.filter(user=self.employee).update(is_read=True)
        events.notify(self.employee, "followup", "same message", "/leads/1")
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 2)


class DashboardTests(SimpleLeadTestBase):
    def test_lead_manager_sees_own_funnel(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_leads"], 1)
        self.assertEqual({row["status"] for row in res.data["count_by_status"]}, set(Lead.Status.values))

    def test_lead_admin_sees_all_leads(self):
        Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area, company_name="Other", project_name="P2",
            created_by=self.other_manager, assigned_to=self.other_manager,
        )
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.data["total_leads"], 2)

    def test_employee_sees_empty_funnel_but_own_overdue_followups(self):
        past = timezone.now().date() - timedelta(days=1)
        Followup.objects.create(
            lead=self.lead, title="Overdue", assigned_to=self.employee,
            created_by=self.lead_manager, followup_date=past,
        )
        self.client.force_authenticate(self.employee)
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.data["total_leads"], 0)
        self.assertEqual(len(res.data["overdue_followups"]), 1)
