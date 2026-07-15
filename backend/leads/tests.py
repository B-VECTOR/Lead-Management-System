from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from reference.models import Area, Country, Industry

from . import engine, holds, projects, resources
from .models import (
    Checklist,
    Followup,
    Lead,
    LeadHold,
    ProjectDetails,
    ResourceAllocation,
    Task,
    TaskHold,
    Workflow,
    WorkflowTriggerConfig,
)
from .workflow_data import BD_WORKFLOW

User = get_user_model()

LIST_URL = "/api/leads/"


def detail_url(pk):
    return f"/api/leads/{pk}/"


class LeadApiTestBase(APITestCase):
    """Shared fixtures: reference rows, role groups, and one user per role."""

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

        self.lead_admin = self._make_user("lead_admin")
        self.lead_manager = self._make_user("lead_manager")
        self.other_manager = self._make_user("lead_manager")
        self.marketing = self._make_user("marketing")
        self.employee = self._make_user("employee")

    def base_payload(self, **overrides):
        data = {
            "country": self.country.id,
            "company_name": "Acme Corp",
            "project_name": "Digital Transformation",
            "industry": self.industry.id,
            "domain": self.area.id,
            "lead_type": "BD",
        }
        data.update(overrides)
        return data


class LeadCreateTests(LeadApiTestBase):
    def test_marketing_create_forces_not_assigned(self):
        self.client.force_authenticate(self.marketing)
        # Even if Marketing tries to set an owner, it is ignored.
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertIsNone(res.data["assigned_to"])
        self.assertEqual(res.data["status"], "In Progress")
        lead = Lead.objects.get(pk=res.data["id"])
        self.assertEqual(lead.created_by, self.marketing)

    def test_lead_manager_create_requires_owner(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(LIST_URL, self.base_payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_to", res.data)

    def test_lead_manager_create_with_owner(self):
        self.client.force_authenticate(self.lead_manager)
        payload = self.base_payload(assigned_to=self.lead_manager.id)
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["assigned_to"], self.lead_manager.id)
        self.assertEqual(res.data["created_by"], self.lead_manager.id)

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
        payload = self.base_payload(assigned_to=self.lead_manager.id, status="Complete")
        res = self.client.post(LIST_URL, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)


class LeadVisibilityTests(LeadApiTestBase):
    def setUp(self):
        super().setUp()
        # Lead created by Marketing, still unassigned.
        self.mkt_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Mkt Co", project_name="P1", created_by=self.marketing,
        )
        # Lead the Lead Manager created and assigned to themselves.
        self.own_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Own Co", project_name="P2", created_by=self.lead_manager,
            assigned_to=self.lead_manager,
        )
        # Lead created by another manager, assigned to our lead_manager.
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
        # An Employee may open the Lead module to work their tasks, but sees
        # only the leads assigned to them — nothing else.
        self.client.force_authenticate(self.employee)
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(self._ids(res), set())
        # Assign a lead to the employee → it now shows up.
        self.assigned_lead.assigned_to = self.employee
        self.assigned_lead.save(update_fields=["assigned_to"])
        res = self.client.get(LIST_URL)
        self.assertEqual(self._ids(res), {self.assigned_lead.id})

    def test_employee_cannot_edit_assigned_lead(self):
        # Read-only: the Employee sees their lead but cannot edit its fields.
        self.assigned_lead.assigned_to = self.employee
        self.assigned_lead.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.employee)
        res = self.client.patch(
            detail_url(self.assigned_lead.id), {"scope": "x"}, format="json"
        )
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
        res = self.client.patch(
            detail_url(self.own_lead.id), {"scope": "hijack"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_manager_can_edit_own_lead(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(detail_url(self.own_lead.id), {"division": "West"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["division"], "West")

    def test_marketing_cannot_edit_others_lead(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.patch(detail_url(self.own_lead.id), {"scope": "x"}, format="json")
        # own_lead is out of Marketing's queryset entirely.
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_guard_on_update(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            detail_url(self.own_lead.id), {"status": "Hybernation"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)

    def test_user_can_drop_lead(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(detail_url(self.own_lead.id), {"status": "Dropped"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "Dropped")

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
        # Per the user, a lead may be assigned only to Lead Managers or
        # Employees — Lead Admin, Marketing, Resource Manager, Finance and User
        # Management are all excluded.
        rm = self._make_user("resource_manager")
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data}
        self.assertEqual(
            ids,
            {self.lead_manager.id, self.other_manager.id, self.employee.id},
        )
        self.assertNotIn(self.marketing.id, ids)
        self.assertNotIn(self.lead_admin.id, ids)
        self.assertNotIn(rm.id, ids)

    def test_excludes_superusers(self):
        # The Django admin/superuser account is hidden from User Management, so
        # it must not be selectable as a lead owner either.
        su = self._make_user()
        su.is_superuser = True
        su.save(update_fields=["is_superuser"])
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn(su.id, {row["id"] for row in res.data})

    def test_excludes_user_management(self):
        # User Management is an exclusive back-office role: its holders never
        # appear in any assignment dropdown.
        um_user = self._make_user("user_management")
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn(um_user.id, {row["id"] for row in res.data})

    def test_marketing_forbidden(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_admin_allowed(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get(self.URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# --- Phase 4: workflow engine ----------------------------------------------

def _future(days=30):
    return (timezone.now().date() + timedelta(days=days)).isoformat()


# Field values that satisfy each task's mandatory-field + global rules, so a
# test can drive a task to closure. Branch-controlling values are overridden
# per test where the branch matters.
_VALUES = {
    1: {"expected_start_date": _future(), "manpower_brown": 2, "manpower_white": 1},
    2: {},
    3: {"presentation_date": _future()},
    4: {"expected_receipt_date": _future()},
    5: {"solution_blueprint_required": "No"},
    6: {},
    7: {"presentation_date": _future(), "re_presentation_required": "No"},
    8: {"presentation_date": _future(), "re_presentation_required_again": "No"},
    9: {"expected_receipt_date": _future()},
    10: {"planned_start_date": _future(), "planned_end_date": _future(90),
         "period_months": 3, "manpower_brown": 2, "manpower_white": 1},
    11: {},
    12: {"actual_start_date": _future(), "modified_planned_end_date": _future(90),
         "period_months": 3, "actual_fixed_fee_invoice_date": _future(),
         "variable_fee_start_date": _future()},
    13: {"extension_approved": "No"},
    14: {"engagement_start_date": _future(), "engagement_end_date": _future(90),
         "period_months": 3, "actual_fixed_fee_invoice_date": _future(),
         "variable_fee_start_date": _future(), "manpower_brown": 1, "manpower_white": 1},
    15: {},
    16: {"engagement_start_date": _future(), "engagement_end_date": _future(90),
         "period_months": 3, "actual_fixed_fee_invoice_date": _future(),
         "variable_fee_start_date": _future()},
    17: {"final_closed": "Yes"},
}


class WorkflowEngineTestBase(LeadApiTestBase):
    """Seeds the active BD workflow and an owned lead (Task 1 auto-opens)."""

    def setUp(self):
        super().setUp()
        self.resource_manager = self._make_user("resource_manager")
        Workflow.objects.create(
            name=BD_WORKFLOW["name"],
            type=BD_WORKFLOW["type"],
            workflow=BD_WORKFLOW,
            status=Workflow.Status.ACTIVE,
        )
        self.lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="WF Co", project_name="WF Project",
            created_by=self.lead_manager, assigned_to=self.lead_manager,
        )

    def open_task(self, task_no):
        """The most-recently-opened open task with this number."""
        return (
            self.lead.tasks.filter(task_no=task_no, status=Task.Status.OPEN)
            .order_by("-id")
            .first()
        )

    def drive(self, task, values=None, close_checklist=True):
        """Fill + close a task via the engine, returning the opened successors."""
        task.extra_fields = _VALUES.get(task.task_no, {}) if values is None else values
        task.save()
        if close_checklist:
            task.checklist_items.update(status=Checklist.Status.COMPLETE)
        return engine.complete_task(task, user=self.lead_manager)


class WorkflowStartTests(WorkflowEngineTestBase):
    def test_owner_at_create_opens_task_1(self):
        task1 = self.lead.tasks.get(task_no=1)
        self.assertEqual(task1.status, Task.Status.OPEN)
        self.assertEqual(task1.assigned_to, self.lead_manager)  # default_bd_person
        self.assertEqual(task1.checklist_items.count(), 5)

    def test_assigning_marketing_lead_opens_task_1(self):
        mkt_lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Mkt", project_name="P", created_by=self.marketing,
        )
        self.assertFalse(mkt_lead.tasks.exists())  # no owner yet → no workflow
        mkt_lead.assigned_to = self.lead_manager
        mkt_lead.save()
        self.assertEqual(mkt_lead.tasks.filter(task_no=1, status="open").count(), 1)

    def test_start_is_idempotent(self):
        # Re-saving an owned lead must not open a second Task 1.
        self.lead.scope = "touched"
        self.lead.save()
        self.assertEqual(self.lead.tasks.filter(task_no=1).count(), 1)

    def test_mining_lead_does_not_start(self):
        mining = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="M", project_name="P", created_by=self.lead_manager,
            assigned_to=self.lead_manager, lead_type=Lead.LeadType.MINING,
        )
        self.assertFalse(mining.tasks.exists())


class TaskClosureTests(WorkflowEngineTestBase):
    def test_cannot_close_with_incomplete_checklist(self):
        task1 = self.open_task(1)
        from rest_framework import serializers as drf
        with self.assertRaises(drf.ValidationError):
            self.drive(task1, values=_VALUES[1], close_checklist=False)

    def test_cannot_close_missing_mandatory_field(self):
        task1 = self.open_task(1)
        from rest_framework import serializers as drf
        with self.assertRaises(drf.ValidationError):
            self.drive(task1, values={"manpower_brown": 1})  # missing date + white

    def test_close_task_1_opens_task_2_allocation_unassigned(self):
        opened = self.drive(self.open_task(1))
        self.assertEqual([t.task_no for t in opened], [2])
        task2 = opened[0]
        self.assertTrue(task2.is_allocation_task)
        self.assertIsNone(task2.assigned_to)  # resource_manager rule → Phase 6
        self.assertEqual(task2.checklist_items.count(), 0)


class RoutingBranchTests(WorkflowEngineTestBase):
    def _advance_to(self, target_no):
        """Drive the default (No-branch) path until ``target_no`` is open."""
        guard = 0
        while self.open_task(target_no) is None and guard < 40:
            open_tasks = self.lead.tasks.filter(status=Task.Status.OPEN).order_by("id")
            self.drive(open_tasks.first())
            guard += 1
        return self.open_task(target_no)

    def test_task3_forks_to_4_and_5(self):
        self.drive(self.open_task(1))  # → 2
        self.drive(self.open_task(2))  # → 3
        opened = self.drive(self.open_task(3))
        self.assertEqual(sorted(t.task_no for t in opened), [4, 5])

    def test_task5_no_skips_to_10(self):
        task5 = self._advance_to(5)
        opened = self.drive(task5, values={"solution_blueprint_required": "No"})
        self.assertEqual([t.task_no for t in opened], [10])

    def test_task5_yes_opens_6(self):
        task5 = self._advance_to(5)
        opened = self.drive(task5, values={
            "solution_blueprint_required": "Yes", "fee": 0, "manpower_brown": 1,
            "manpower_white": 1, "expected_start_date": _future(), "payment_tranches": 2,
        })
        self.assertEqual([t.task_no for t in opened], [6])

    def test_task7_repeat_presentation_loop(self):
        task5 = self._advance_to(5)
        self.drive(task5, values={
            "solution_blueprint_required": "Yes", "fee": 0, "manpower_brown": 1,
            "manpower_white": 1, "expected_start_date": _future(), "payment_tranches": 1,
        })  # → 6
        self.drive(self.open_task(6))  # → 7
        opened = self.drive(self.open_task(7), values={
            "presentation_date": _future(), "re_presentation_required": "Yes",
        })
        self.assertEqual([t.task_no for t in opened], [8])
        # 8 Yes loops to a fresh 8; No proceeds to 9.
        opened = self.drive(self.open_task(8), values={
            "presentation_date": _future(), "re_presentation_required_again": "Yes",
        })
        self.assertEqual([t.task_no for t in opened], [8])
        opened = self.drive(self.open_task(8), values={
            "presentation_date": _future(), "re_presentation_required_again": "No",
        })
        self.assertEqual([t.task_no for t in opened], [9])

    def test_extension_cycle_loops_13_to_16_then_closes(self):
        task13 = self._advance_to(13)
        # Approve once → 14 → 15 → 16 → back to a fresh 13.
        opened = self.drive(task13, values={"extension_approved": "Yes"})
        self.assertEqual([t.task_no for t in opened], [14])
        self.drive(self.open_task(14))  # → 15
        self.drive(self.open_task(15))  # → 16
        opened = self.drive(self.open_task(16))  # loops → 13
        self.assertEqual([t.task_no for t in opened], [13])
        # Decline the second cycle → Project Closure (17).
        opened = self.drive(self.open_task(13), values={"extension_approved": "No"})
        self.assertEqual([t.task_no for t in opened], [17])
        # 17 is terminal.
        opened = self.drive(self.open_task(17))
        self.assertEqual(opened, [])

    def test_full_default_path_reaches_17(self):
        task17 = self._advance_to(17)
        self.assertIsNotNone(task17)


class TaskApiTests(WorkflowEngineTestBase):
    def test_owner_lists_lead_tasks(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(f"/api/leads/{self.lead.id}/tasks/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["task_no"], 1)
        self.assertEqual(len(res.data[0]["field_schema"]), 4)

    def test_draft_save_rejects_negative_number(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/",
            {"extra_fields": {"manpower_brown": -1}}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_save_rejects_past_date(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/",
            {"extra_fields": {"expected_start_date": "2000-01-01"}}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_draft_save_persists_valid_values(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/",
            {"extra_fields": {"manpower_brown": 3}}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task1.refresh_from_db()
        self.assertEqual(task1.extra_fields["manpower_brown"], 3)

    def test_non_assignee_cannot_edit_task(self):
        task1 = self.open_task(1)  # assigned to lead_manager
        self.client.force_authenticate(self.other_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/", {"extra_fields": {}}, format="json"
        )
        # other_manager isn't in scope for this lead → 404 (not even visible).
        self.assertIn(res.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_complete_via_api_opens_next(self):
        task1 = self.open_task(1)
        task1.extra_fields = _VALUES[1]
        task1.save()
        task1.checklist_items.update(status=Checklist.Status.COMPLETE)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/tasks/{task1.id}/complete/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["task"]["status"], "closed")
        self.assertEqual([t["task_no"] for t in res.data["opened_tasks"]], [2])

    def test_complete_blocked_for_non_assignee(self):
        # Open Task 2 (unassigned) then check a stranger can't complete it.
        # (Lead Admin, and the lead's own owner/creator, now *can* — Phase 9
        # widened can_edit_task/can_reassign_task beyond the assignee alone —
        # so this uses an unrelated Lead Manager who is neither.)
        self.drive(self.open_task(1))
        task2 = self.open_task(2)
        self.client.force_authenticate(self.other_manager)
        res = self.client.post(f"/api/tasks/{task2.id}/complete/")
        self.assertIn(res.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_reassign_makes_new_user_the_editor(self):
        self.drive(self.open_task(1))
        task2 = self.open_task(2)  # unassigned allocation task
        self.client.force_authenticate(self.lead_admin)  # LA may reassign
        res = self.client.post(
            f"/api/tasks/{task2.id}/reassign/",
            {"assigned_to": self.resource_manager.id}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        task2.refresh_from_db()
        self.assertEqual(task2.assigned_to, self.resource_manager)
        # Now the new assignee can complete it.
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(f"/api/tasks/{task2.id}/complete/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_checklist_item_update_stamps_editor(self):
        task1 = self.open_task(1)
        item = task1.checklist_items.first()
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/checklist-items/{item.id}/",
            {"status": "complete", "remark": "done"}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        item.refresh_from_db()
        self.assertEqual(item.status, "complete")
        self.assertEqual(item.last_edited_by, self.lead_manager)
        self.assertIsNotNone(item.last_edited_at)

    def test_only_task_assignee_can_edit(self):
        # Phase 11 (per the user): only the task's assignee edits/completes it —
        # the lead's creator/owner can no longer edit a task they aren't the
        # assignee of (reverting the Phase-9 widening).
        task1 = self.open_task(1)  # assigned to the lead owner (self-assigned LM)
        self.drive(task1)
        task2 = self.open_task(2)  # unassigned
        self.client.force_authenticate(self.lead_manager)  # lead owner + creator
        # Can still view via the lead's task list…
        res = self.client.get(f"/api/leads/{self.lead.id}/tasks/")
        self.assertIn(2, [t["task_no"] for t in res.data])
        # …but can no longer edit a task they aren't assigned to.
        res = self.client.patch(
            f"/api/tasks/{task2.id}/", {"extra_fields": {}}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, res.data)

    def test_self_assigned_manager_can_edit_own_task(self):
        # A self-assigned Lead Manager IS the task assignee, so they may edit.
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/", {"extra_fields": {}}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_non_assignee_manager_cannot_edit_assigned_task(self):
        # Task reassigned to the employee — the (non-assignee) LM owner may no
        # longer edit it; the assignee can.
        task1 = self.open_task(1)
        task1.assigned_to = self.employee
        task1.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/", {"extra_fields": {}}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, res.data)
        self.client.force_authenticate(self.employee)
        res = self.client.patch(
            f"/api/tasks/{task1.id}/", {"extra_fields": {}}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_expected_start_date_floor_is_lead_creation(self):
        # Phase 11 (#4): expected_start_date may be back-dated to the lead's
        # creation date (relaxing the global "before today" rule for this field),
        # but not earlier.
        created = timezone.now() - timedelta(days=10)
        Lead.objects.filter(pk=self.lead.id).update(created_at=created)
        self.lead.refresh_from_db()
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        # A date after creation but before today — allowed by the exemption.
        between = (created.date() + timedelta(days=2)).isoformat()
        res = self.client.patch(
            f"/api/tasks/{task1.id}/",
            {"extra_fields": {"expected_start_date": between}}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        # A date before the lead was created — rejected.
        before = (created.date() - timedelta(days=1)).isoformat()
        res = self.client.patch(
            f"/api/tasks/{task1.id}/",
            {"extra_fields": {"expected_start_date": before}}, format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn("extra_fields", res.data)


# --- Phase 5: trigger scheduler --------------------------------------------

class TriggerSchedulerTests(WorkflowEngineTestBase):
    """Date-offset opening of trigger tasks (Tech Req §4.12 / PRD §5.6)."""

    def setUp(self):
        super().setUp()
        self.workflow = Workflow.objects.get(type=Lead.LeadType.BD)

    def _config(self, task_no=2, reference_task_no=1,
                reference_field_key="expected_start_date", offset_days=0):
        return WorkflowTriggerConfig.objects.create(
            workflow=self.workflow,
            task_no=task_no,
            reference_task_no=reference_task_no,
            reference_field_key=reference_field_key,
            offset_days=offset_days,
        )

    def test_successor_with_trigger_is_created_pending(self):
        self._config(task_no=2)
        opened = self.drive(self.open_task(1))
        self.assertEqual([t.task_no for t in opened], [2])
        self.assertEqual(opened[0].status, Task.Status.PENDING)
        self.assertIsNone(opened[0].opened_at)

    def test_successor_without_trigger_opens_immediately(self):
        # No config for task 2 → the Phase-4 immediate-open behaviour holds.
        opened = self.drive(self.open_task(1))
        self.assertEqual(opened[0].status, Task.Status.OPEN)

    def test_scheduler_opens_only_when_offset_date_reached(self):
        self._config(task_no=2, offset_days=0)
        today = timezone.now().date()
        # Task 1's expected_start_date is 5 days out.
        opened = self.drive(
            self.open_task(1),
            values={"expected_start_date": (today + timedelta(days=5)).isoformat(),
                    "manpower_brown": 1, "manpower_white": 1},
        )
        task2 = opened[0]
        # Not yet due (offset 0, reference 5 days out).
        self.assertEqual(engine.run_due_triggers(today=today), [])
        task2.refresh_from_db()
        self.assertEqual(task2.status, Task.Status.PENDING)
        # On the reference date it opens.
        fired = engine.run_due_triggers(today=today + timedelta(days=5))
        self.assertEqual([t.id for t in fired], [task2.id])
        task2.refresh_from_db()
        self.assertEqual(task2.status, Task.Status.OPEN)
        self.assertIsNotNone(task2.opened_at)

    def test_offset_opens_task_early(self):
        self._config(task_no=2, offset_days=10)
        today = timezone.now().date()
        opened = self.drive(
            self.open_task(1),
            values={"expected_start_date": (today + timedelta(days=8)).isoformat(),
                    "manpower_brown": 1, "manpower_white": 1},
        )
        # Reference is 8 days out but the 10-day offset means it is already due.
        fired = engine.run_due_triggers(today=today)
        self.assertEqual([t.id for t in fired], [opened[0].id])

    def test_scheduler_skips_held_lead(self):
        self._config(task_no=2, offset_days=30)
        opened = self.drive(self.open_task(1))  # task 2 pending
        holds.hold_lead(self.lead, self.lead_manager)
        self.assertEqual(engine.run_due_triggers(), [])
        opened[0].refresh_from_db()
        self.assertEqual(opened[0].status, Task.Status.PENDING)

    def test_scheduler_is_idempotent(self):
        self._config(task_no=2, offset_days=30)
        self.drive(self.open_task(1))
        first = engine.run_due_triggers()
        second = engine.run_due_triggers()
        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])  # already opened → not re-opened

    def test_seed_trigger_config_command(self):
        from django.core.management import call_command
        call_command("seed_trigger_config")
        # Every task carrying a trigger hint gets a config row.
        hinted = [t["task_no"] for t in BD_WORKFLOW["tasks"] if t.get("trigger")]
        self.assertEqual(
            WorkflowTriggerConfig.objects.filter(workflow=self.workflow).count(),
            len(hinted),
        )
        call_command("seed_trigger_config")  # idempotent
        self.assertEqual(
            WorkflowTriggerConfig.objects.filter(workflow=self.workflow).count(),
            len(hinted),
        )


# --- Phase 5: hold / unhold + elapsed time ---------------------------------

class HoldServiceTests(WorkflowEngineTestBase):
    def test_hold_lead_cascades_to_open_tasks(self):
        task1 = self.open_task(1)
        lead_hold = holds.hold_lead(self.lead, self.lead_manager)
        self.lead.refresh_from_db()
        task1.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.ON_HOLD)
        self.assertEqual(task1.status, Task.Status.HOLD)
        self.assertIsNotNone(lead_hold)
        self.assertTrue(LeadHold.objects.filter(lead=self.lead, unhold_at__isnull=True).exists())
        self.assertTrue(TaskHold.objects.filter(task=task1, unhold_at__isnull=True).exists())

    def test_unhold_lead_restores_tasks(self):
        task1 = self.open_task(1)
        holds.hold_lead(self.lead, self.lead_manager)
        holds.unhold_lead(self.lead, self.lead_admin)
        self.lead.refresh_from_db()
        task1.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.IN_PROGRESS)
        self.assertEqual(task1.status, Task.Status.OPEN)
        hold = LeadHold.objects.get(lead=self.lead)
        self.assertIsNotNone(hold.unhold_at)
        self.assertEqual(hold.unhold_by, self.lead_admin)

    def test_hold_lead_is_no_op_when_not_in_progress(self):
        holds.hold_lead(self.lead, self.lead_manager)  # → On Hold
        second = holds.hold_lead(self.lead, self.lead_manager)  # already held
        self.assertIsNone(second)
        self.assertEqual(LeadHold.objects.filter(lead=self.lead).count(), 1)

    def test_held_task_is_not_editable(self):
        task1 = self.open_task(1)
        holds.hold_task(task1, self.lead_manager)
        task1.refresh_from_db()
        self.assertFalse(task1.is_editable)

    def test_elapsed_time_excludes_held_duration(self):
        task1 = self.open_task(1)
        t0 = timezone.now()
        task1.opened_at = t0
        task1.save(update_fields=["opened_at"])
        TaskHold.objects.create(
            task=task1, hold_by=self.lead_manager,
            hold_at=t0 + timedelta(minutes=10),
            unhold_at=t0 + timedelta(minutes=40),  # held for 30 min
        )
        elapsed = holds.compute_elapsed_time(task1, closed_at=t0 + timedelta(minutes=100))
        self.assertEqual(elapsed, timedelta(minutes=70))

    def test_complete_stamps_elapsed_time(self):
        opened = self.drive(self.open_task(1))
        closed = self.lead.tasks.get(task_no=1)
        self.assertIsNotNone(closed.elapsed_time)


class HoldApiTests(WorkflowEngineTestBase):
    def test_owner_holds_and_unholds_lead(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "On Hold")
        task1.refresh_from_db()
        self.assertEqual(task1.status, Task.Status.HOLD)
        res = self.client.post(f"/api/leads/{self.lead.id}/unhold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "In Progress")

    def test_held_leads_list(self):
        holds.hold_lead(self.lead, self.lead_manager)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get("/api/held-leads/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in (res.data.get("results") or res.data)]
        self.assertIn(self.lead.id, ids)

    def test_hold_lead_forbidden_out_of_scope(self):
        # other_manager neither created nor owns this lead → not visible → 404.
        self.client.force_authenticate(self.other_manager)
        res = self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_hold_lead_notifies_assignee(self):
        # Lead owned by the employee, held by its Lead-Manager creator → the
        # employee (assignee) is notified instead of watching a Held Leads tab.
        self.lead.assigned_to = self.employee
        self.lead.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(
            Notification.objects.filter(
                user=self.employee, type=Notification.Type.LEAD_HELD
            ).exists()
        )

    def test_hold_own_lead_does_not_notify_self(self):
        # lead_manager owns self.lead; holding it must not notify themselves.
        self.client.force_authenticate(self.lead_manager)
        self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertFalse(
            Notification.objects.filter(
                user=self.lead_manager, type=Notification.Type.LEAD_HELD
            ).exists()
        )

    def test_hold_task_notifies_assignee(self):
        # Phase 11: task hold = assignee only (+ Lead Admin override). A Lead
        # Admin holding a task assigned to the employee notifies the assignee.
        task1 = self.open_task(1)
        task1.assigned_to = self.employee
        task1.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.lead_admin)
        res = self.client.post(f"/api/tasks/{task1.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(
            Notification.objects.filter(
                user=self.employee, type=Notification.Type.TASK_HELD
            ).exists()
        )

    def test_non_assignee_manager_cannot_hold_task(self):
        # A Lead Manager who is not the task's assignee can no longer hold it
        # (Phase 11) — task hold belongs to the assignee.
        task1 = self.open_task(1)
        task1.assigned_to = self.employee
        task1.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/tasks/{task1.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, res.data)

    def test_plain_assignee_cannot_hold_lead(self):
        # Phase 11: the plain-employee assignee holds their task, not the lead.
        self.lead.assigned_to = self.employee
        self.lead.save(update_fields=["assigned_to"])
        self.client.force_authenticate(self.employee)
        res = self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN, res.data)

    def test_task_hold_and_held_tasks_list(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/tasks/{task1.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "hold")
        res = self.client.get("/api/held-tasks/")
        self.assertIn(task1.id, [t["id"] for t in res.data])
        res = self.client.post(f"/api/tasks/{task1.id}/unhold/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["status"], "open")

    def test_cannot_hold_already_held_lead_via_api(self):
        holds.hold_lead(self.lead, self.lead_manager)
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(f"/api/leads/{self.lead.id}/hold/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_direct_status_on_hold_write_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.patch(
            f"/api/leads/{self.lead.id}/", {"status": "On Hold"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", res.data)


# --- Phase 6: resource allocation, Project ID & project closure -------------

class Phase6TestBase(WorkflowEngineTestBase):
    """Adds an Execution-Red user + helpers to walk allocation-driven tasks."""

    def setUp(self):
        super().setUp()
        self.exec_red = self._make_user("employee")

    def drive_alloc(self, task, red):
        """Fill an allocation row's Execution Red and submit it (RM flow)."""
        alloc = task.resource_allocations.first()
        alloc.execution_red = red
        alloc.save()
        return resources.submit_allocation(alloc, self.resource_manager)

    def walk_to_task12(self):
        """No-blueprint path (Task 5 = No) up to an open Task 12."""
        self.drive(self.open_task(1))                                  # → 2
        self.drive_alloc(self.open_task(2), self.exec_red)             # → 3
        self.drive(self.open_task(3))                                  # → 4, 5
        self.drive(self.open_task(4))                                  # 2HR auto-closes
        self.drive(self.open_task(5), values={"solution_blueprint_required": "No"})  # → 10
        self.drive(self.open_task(10))                                 # → 11
        self.drive_alloc(self.open_task(11), self.exec_red)            # → 12
        return self.open_task(12)


class AllocationEngineTests(Phase6TestBase):
    def test_allocation_row_created_on_allocation_task_open(self):
        self.drive(self.open_task(1))  # → Task 2 (2HR allocation) opens
        task2 = self.open_task(2)
        alloc = task2.resource_allocations.first()
        self.assertIsNotNone(alloc)
        self.assertEqual(alloc.type, ResourceAllocation.Type.TWO_HR)
        self.assertEqual(alloc.status, ResourceAllocation.Status.PENDING)
        # man_power_required = Task 1 brown(2) + white(1)
        self.assertEqual(alloc.man_power_required, 3)

    def test_submit_allocation_opens_successor_assigned_to_execution_red(self):
        self.drive(self.open_task(1))  # → 2
        opened = self.drive_alloc(self.open_task(2), self.exec_red)  # → 3
        self.assertEqual([t.task_no for t in opened], [3])
        self.assertEqual(opened[0].assigned_to, self.exec_red)
        alloc = self.lead.resource_allocations.get(type="2HR")
        self.assertEqual(alloc.status, ResourceAllocation.Status.OPEN)

    def test_snt_allocation_autocloses_when_task9_closes(self):
        # Blueprint path (Task 5 = Yes) creates the SNT allocation at Task 6;
        # it must auto-free when Task 9 (Solution Blueprint Payment) closes.
        blueprint = {
            "solution_blueprint_required": "Yes", "fee": 100,
            "manpower_brown": 2, "manpower_white": 1,
            "expected_start_date": _future(), "payment_tranches": 2,
        }
        self.drive(self.open_task(1))                        # → 2
        self.drive_alloc(self.open_task(2), self.exec_red)   # → 3
        self.drive(self.open_task(3))                        # → 4, 5
        self.drive(self.open_task(4))                        # 2HR closes
        self.drive(self.open_task(5), values=blueprint)      # → 6 (SNT alloc)
        self.drive_alloc(self.open_task(6), self.exec_red)   # → 7
        self.drive(self.open_task(7))                        # 7 No → 9
        snt = self.lead.resource_allocations.get(type="SNT")
        self.assertEqual(snt.status, ResourceAllocation.Status.OPEN)
        self.assertEqual(snt.man_power_brown, 2)  # split preserved
        self.drive(self.open_task(9))                        # SNT auto-closes
        snt.refresh_from_db()
        self.assertEqual(snt.status, ResourceAllocation.Status.CLOSED)

    def test_2hr_allocation_autocloses_when_task4_closes(self):
        self.drive(self.open_task(1))                       # → 2
        self.drive_alloc(self.open_task(2), self.exec_red)  # → 3
        self.drive(self.open_task(3))                       # → 4, 5
        alloc = self.lead.resource_allocations.get(type="2HR")
        self.assertEqual(alloc.status, ResourceAllocation.Status.OPEN)
        self.drive(self.open_task(4))                       # 2HR auto-closes
        alloc.refresh_from_db()
        self.assertEqual(alloc.status, ResourceAllocation.Status.CLOSED)
        self.assertIsNotNone(alloc.closed_at)

    def test_manpower_split_preserved(self):
        self.drive(self.open_task(1))  # Task 1: brown 2, white 1
        alloc = self.open_task(2).resource_allocations.first()
        self.assertEqual(alloc.man_power_brown, 2)
        self.assertEqual(alloc.man_power_white, 1)
        self.assertEqual(alloc.man_power_required, 3)

    def test_over_allocation_flag_per_belt(self):
        # Task 1 requires 2 Brown, 1 White. Allocating 3 Browns exceeds the
        # Brown requirement → over-allocated (per-belt check).
        self.drive(self.open_task(1))
        alloc = self.open_task(2).resource_allocations.first()
        alloc.execution_red = self.exec_red
        alloc.execution_browns.add(self.lead_manager, self.marketing, self.employee)  # 3 > 2
        alloc.whites.add(self.lead_admin)  # 1 == 1, fine
        self.assertEqual(alloc.brown_count, 3)
        self.assertEqual(alloc.white_count, 1)
        self.assertEqual(alloc.allocated_count, 5)  # red + 3 brown + 1 white
        self.assertTrue(alloc.is_over_allocated)

    def test_within_manpower_not_over_allocated(self):
        self.drive(self.open_task(1))  # 2 Brown, 1 White
        alloc = self.open_task(2).resource_allocations.first()
        alloc.execution_red = self.exec_red
        alloc.execution_browns.add(self.lead_manager, self.marketing)  # 2 == 2
        alloc.whites.add(self.lead_admin)  # 1 == 1
        self.assertFalse(alloc.is_over_allocated)


class ProjectIdTests(Phase6TestBase):
    def test_task12_generates_project_id_and_hybernation(self):
        task12 = self.walk_to_task12()
        self.drive(task12)  # close → Project ID + Hybernation
        self.lead.refresh_from_db()
        self.assertRegex(self.lead.project_id, r"^IN-PHNPD\d{2}001-I00$")
        self.assertRegex(self.lead.project_id_base, r"^IN-PHNPD\d{2}001$")
        self.assertEqual(self.lead.extension, "00")
        self.assertEqual(self.lead.status, Lead.Status.HYBERNATION)
        details = ProjectDetails.objects.filter(lead=self.lead)
        self.assertEqual(details.count(), 1)
        row = details.first()
        self.assertEqual(row.extension_no, "00")
        self.assertTrue(row.is_current)
        self.assertEqual(row.status, ProjectDetails.Status.IN_PROGRESS)
        self.assertEqual(row.resource_allocation.type, "Implementation")

    def test_task16_regenerates_and_cycles_history(self):
        self.drive(self.walk_to_task12())               # Task 12 closed → I00
        base = Lead.objects.get(pk=self.lead.pk).project_id_base
        # Task 13 approved = Yes → 14 → 15 (Extension alloc) → 16
        self.drive(self.open_task(13), values={"extension_approved": "Yes"})  # → 14
        self.drive(self.open_task(14))                                        # → 15
        self.drive_alloc(self.open_task(15), self.exec_red)                   # → 16
        self.drive(self.open_task(16))                                        # regenerate
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.extension, "01")
        self.assertEqual(self.lead.project_id, f"{base}-I01")
        old = ProjectDetails.objects.get(lead=self.lead, extension_no="00")
        new = ProjectDetails.objects.get(lead=self.lead, extension_no="01")
        self.assertEqual(old.status, ProjectDetails.Status.EXTENDED)
        self.assertFalse(old.is_current)
        self.assertTrue(new.is_current)
        self.assertEqual(new.resource_allocation.type, "Extension")

    def test_task17_completes_lead_and_closes_allocations(self):
        self.drive(self.walk_to_task12())  # → Task 13 opens (I00)
        self.drive(self.open_task(13), values={"extension_approved": "No"})  # → 17
        self.drive(self.open_task(17), values={"final_closed": "Yes"})       # close
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.COMPLETE)
        self.assertEqual(
            ProjectDetails.objects.get(lead=self.lead, is_current=True).status,
            ProjectDetails.Status.COMPLETE,
        )
        impl = self.lead.resource_allocations.get(type="Implementation")
        self.assertEqual(impl.status, ResourceAllocation.Status.CLOSED)

    def test_sequence_increments_across_leads(self):
        self.drive(self.walk_to_task12())
        first = Lead.objects.get(pk=self.lead.pk).project_id
        # A second lead reaching Task 12 gets the next sequence.
        self.lead = Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Second", project_name="P2",
            created_by=self.lead_manager, assigned_to=self.lead_manager,
        )
        self.drive(self.walk_to_task12())
        second = Lead.objects.get(pk=self.lead.pk).project_id
        self.assertTrue(first.endswith("001-I00"), first)
        self.assertTrue(second.endswith("002-I00"), second)


class ResourceApiTests(Phase6TestBase):
    def setUp(self):
        super().setUp()
        self.drive(self.open_task(1))  # → Task 2 allocation open + 2HR row
        self.alloc = self.open_task(2).resource_allocations.first()

    def test_non_rm_cannot_list_allocations(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get("/api/resource-allocations/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_rm_lists_allocations(self):
        self.client.force_authenticate(self.resource_manager)
        res = self.client.get("/api/resource-allocations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["man_power_required"], 3)

    def test_lead_people_see_lead_scoped_allocations(self):
        # Phase 11 (#6): the lead's own people read their allocations on the
        # Lead Detail Resources tab, not just the RM.
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(f"/api/leads/{self.lead.id}/resource-allocations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(len(res.data), 1)
        self.assertIn("man_power_brown", res.data[0])

    def test_lead_scoped_allocations_out_of_scope_404(self):
        # A Lead Manager with no visibility of this lead gets a 404.
        self.client.force_authenticate(self.other_manager)
        res = self.client.get(f"/api/leads/{self.lead.id}/resource-allocations/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_rm_patch_then_submit_allocation(self):
        self.client.force_authenticate(self.resource_manager)
        patch = self.client.patch(
            f"/api/resource-allocations/{self.alloc.id}/",
            {"execution_red": self.exec_red.id, "remark": "team A"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK, patch.data)
        submit = self.client.post(f"/api/resource-allocations/{self.alloc.id}/submit/")
        self.assertEqual(submit.status_code, status.HTTP_200_OK, submit.data)
        self.assertEqual([t["task_no"] for t in submit.data["opened_tasks"]], [3])
        self.alloc.refresh_from_db()
        self.assertEqual(self.alloc.status, ResourceAllocation.Status.OPEN)

    def test_rm_patches_multi_select_browns_and_whites(self):
        self.client.force_authenticate(self.resource_manager)
        res = self.client.patch(
            f"/api/resource-allocations/{self.alloc.id}/",
            {
                "execution_red": self.exec_red.id,
                "execution_browns": [self.lead_manager.id, self.marketing.id],
                "whites": [self.lead_admin.id],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["brown_count"], 2)
        self.assertEqual(res.data["white_count"], 1)
        self.assertEqual(sorted(res.data["execution_browns"]),
                         sorted([self.lead_manager.id, self.marketing.id]))
        self.assertEqual(res.data["man_power_brown"], 2)
        self.assertEqual(res.data["man_power_white"], 1)
        self.assertFalse(res.data["is_over_allocated"])

    def test_allocation_users_rm_only(self):
        self.client.force_authenticate(self.marketing)
        self.assertEqual(
            self.client.get("/api/allocation-users/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        um_user = self._make_user("user_management")
        self.client.force_authenticate(self.resource_manager)
        res = self.client.get("/api/allocation-users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreater(len(res.data), 1)
        # User Management holders are never selectable in the resource dropdown.
        self.assertNotIn(um_user.id, {row["id"] for row in res.data})

    def test_allocation_users_only_lead_managers_and_employees(self):
        # The task-assignment screen allocates only Lead Manager / Employee
        # people (Marketing, Finance, Resource Manager, Lead Admin excluded).
        self.client.force_authenticate(self.resource_manager)
        res = self.client.get("/api/allocation-users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in res.data}
        self.assertIn(self.lead_manager.id, ids)
        self.assertIn(self.employee.id, ids)
        self.assertNotIn(self.marketing.id, ids)
        self.assertNotIn(self.lead_admin.id, ids)
        self.assertNotIn(self.resource_manager.id, ids)


class ProjectClosureApiTests(Phase6TestBase):
    def setUp(self):
        super().setUp()
        self.drive(self.walk_to_task12())  # Task 12 closed → one project cycle

    def test_project_closure_list_rm_only(self):
        self.client.force_authenticate(self.lead_manager)
        self.assertEqual(
            self.client.get("/api/project-closure/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(self.resource_manager)
        res = self.client.get("/api/project-closure/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["extension_no"], "00")
        self.assertTrue(res.data[0]["can_short_close"])

    def test_short_close_opens_project_closure_task(self):
        detail = ProjectDetails.objects.get(lead=self.lead, is_current=True)
        self.client.force_authenticate(self.resource_manager)
        res = self.client.post(f"/api/project-closure/{detail.id}/short-close/")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["task_no"], 17)
        self.assertTrue(
            self.lead.tasks.filter(task_no=17, status=Task.Status.OPEN).exists()
        )

    def test_short_close_twice_is_rejected(self):
        detail = ProjectDetails.objects.get(lead=self.lead, is_current=True)
        self.client.force_authenticate(self.resource_manager)
        self.client.post(f"/api/project-closure/{detail.id}/short-close/")
        again = self.client.post(f"/api/project-closure/{detail.id}/short-close/")
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)


class FollowupApiTestBase(LeadApiTestBase):
    """Adds a lead + a resolved followup-assignee (employee) on top of the base
    role fixtures for the follow-up / Other-Tasks tests (Phase 7)."""

    FOLLOWUPS_URL = "/api/followups/"
    ASSIGNEES_URL = "/api/followup-assignees/"

    def setUp(self):
        super().setUp()
        self.lead = Lead.objects.create(
            country=self.country,
            company_name="Acme Corp",
            project_name="Digital Transformation",
            industry=self.industry,
            domain=self.area,
            lead_type=Lead.LeadType.BD,
            assigned_to=self.lead_manager,
            created_by=self.lead_manager,
        )
        self.future = (timezone.now().date() + timedelta(days=5)).isoformat()

    def followup_payload(self, **overrides):
        data = {
            "lead": self.lead.id,
            "title": "Call the client",
            "assigned_to": self.employee.id,
            "followup_date": self.future,
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
        self.assertEqual(res.data["assigned_to"], self.employee.id)
        self.assertEqual(res.data["status"], "open")

    def test_lead_manager_can_self_assign(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(
            self.FOLLOWUPS_URL,
            self.followup_payload(assigned_to=self.lead_manager.id),
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_status_forced_open_on_create(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(
            self.FOLLOWUPS_URL, self.followup_payload(status="done"), format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["status"], "open")

    def test_past_followup_date_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        past = (timezone.now().date() - timedelta(days=1)).isoformat()
        res = self.client.post(
            self.FOLLOWUPS_URL, self.followup_payload(followup_date=past), format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("followup_date", res.data)

    def test_non_lead_manager_cannot_create(self):
        for user in (self.marketing, self.lead_admin, self.employee):
            self.client.force_authenticate(user)
            res = self.client.post(self.FOLLOWUPS_URL, self.followup_payload(), format="json")
            self.assertEqual(
                res.status_code, status.HTTP_403_FORBIDDEN, f"{user} should be blocked"
            )


class FollowupVisibilityTests(FollowupApiTestBase):
    def setUp(self):
        super().setUp()
        # Raised by the LM, assigned to the employee.
        self.followup = Followup.objects.create(
            lead=self.lead,
            title="Call the client",
            assigned_to=self.employee,
            created_by=self.lead_manager,
            followup_date=self.future,
        )

    def test_assignee_sees_own_followup(self):
        self.client.force_authenticate(self.employee)
        res = self.client.get(self.FOLLOWUPS_URL + "?assigned_to_me=1")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [f["id"] for f in (res.data["results"] if isinstance(res.data, dict) else res.data)]
        self.assertIn(self.followup.id, ids)

    def test_creator_sees_followup(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.FOLLOWUPS_URL)
        ids = [f["id"] for f in (res.data["results"] if isinstance(res.data, dict) else res.data)]
        self.assertIn(self.followup.id, ids)

    def test_unrelated_user_sees_nothing(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.get(self.FOLLOWUPS_URL)
        ids = [f["id"] for f in (res.data["results"] if isinstance(res.data, dict) else res.data)]
        self.assertNotIn(self.followup.id, ids)

    def test_lead_admin_sees_all_history_for_lead(self):
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get(self.FOLLOWUPS_URL + f"?lead={self.lead.id}")
        ids = [f["id"] for f in (res.data["results"] if isinstance(res.data, dict) else res.data)]
        self.assertIn(self.followup.id, ids)


class FollowupUpdateTests(FollowupApiTestBase):
    def setUp(self):
        super().setUp()
        self.followup = Followup.objects.create(
            lead=self.lead,
            title="Call the client",
            assigned_to=self.employee,
            created_by=self.lead_manager,
            followup_date=self.future,
        )

    def _detail(self):
        return f"/api/followups/{self.followup.id}/"

    def test_assignee_marks_done(self):
        self.client.force_authenticate(self.employee)
        res = self.client.patch(self._detail(), {"status": "done"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.followup.refresh_from_db()
        self.assertEqual(self.followup.status, "done")

    def test_unrelated_user_cannot_see_or_edit(self):
        self.client.force_authenticate(self.marketing)
        res = self.client.patch(self._detail(), {"status": "done"}, format="json")
        # Out of scope → not found (queryset filters it out).
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_delete(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.delete(self._detail())
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_comment_thread_add_and_list(self):
        self.client.force_authenticate(self.employee)
        url = f"/api/followups/{self.followup.id}/updates/"
        add = self.client.post(url, {"comment": "Left a voicemail."}, format="json")
        self.assertEqual(add.status_code, status.HTTP_201_CREATED, add.data)
        self.assertEqual(add.data["author"], self.employee.id)
        listing = self.client.get(url)
        comments = listing.data if isinstance(listing.data, list) else listing.data["results"]
        self.assertEqual(len(comments), 1)

    def test_unrelated_user_cannot_comment(self):
        self.client.force_authenticate(self.marketing)
        url = f"/api/followups/{self.followup.id}/updates/"
        res = self.client.post(url, {"comment": "hi"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class FollowupAssigneeListTests(FollowupApiTestBase):
    def test_lead_manager_can_list_assignees(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get(self.ASSIGNEES_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 1)

    def test_non_lead_manager_forbidden(self):
        self.client.force_authenticate(self.employee)
        res = self.client.get(self.ASSIGNEES_URL)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# --- Phase 8: Activity log, Attachments, Notifications, Dashboard -----------

import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from .models import ActivityLog, Attachment, Notification


class ActivityLogTests(WorkflowEngineTestBase):
    """Auto-logged events + lead-scoped activity endpoint (PRD §6)."""

    def test_lead_create_logs_activity(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.post(
            LIST_URL, self.base_payload(assigned_to=self.lead_manager.id), format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        lead_id = res.data["id"]
        acts = self.client.get(f"/api/leads/{lead_id}/activities/")
        self.assertEqual(acts.status_code, status.HTTP_200_OK)
        summaries = [a["summary"] for a in acts.data]
        self.assertIn("Lead created", summaries)

    def test_completing_task_logs_activity(self):
        task1 = self.open_task(1)
        self.client.force_authenticate(self.lead_manager)
        task1.checklist_items.update(status=Checklist.Status.COMPLETE)
        task1.extra_fields = _VALUES.get(1, {})
        task1.save()
        self.client.post(f"/api/tasks/{task1.id}/complete/")
        summaries = list(
            ActivityLog.objects.filter(lead=self.lead).values_list("summary", flat=True)
        )
        self.assertTrue(any("completed" in s for s in summaries))

    def test_activity_scoped_to_lead_visibility(self):
        ActivityLog.objects.create(lead=self.lead, actor=self.lead_manager, type="lead", summary="x")
        # A different Lead Manager cannot see this lead's activity (404 on lookup).
        self.client.force_authenticate(self.other_manager)
        res = self.client.get(f"/api/leads/{self.lead.id}/activities/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_lead_admin_sees_activity(self):
        ActivityLog.objects.create(lead=self.lead, actor=self.lead_manager, type="lead", summary="x")
        self.client.force_authenticate(self.lead_admin)
        res = self.client.get(f"/api/leads/{self.lead.id}/activities/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 1)

    def test_lead_reassignment_logs_actor_and_remark(self):
        # Phase 11 (#1): reassigning an already-assigned lead records who → who,
        # the acting user, and the optional remark.
        self.client.force_authenticate(self.lead_manager)  # creator + current owner
        res = self.client.patch(
            detail_url(self.lead.id),
            {"assigned_to": self.other_manager.id, "remark": "handing over"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        entry = (
            ActivityLog.objects.filter(lead=self.lead, type="lead")
            .order_by("-id")
            .first()
        )
        self.assertIsNotNone(entry)
        self.assertIn("reassigned", entry.summary.lower())
        self.assertEqual(entry.actor, self.lead_manager)
        self.assertEqual(entry.body, "handing over")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AttachmentTests(WorkflowEngineTestBase):
    """Upload / list / delete lead attachments with the 5 MB cap (Decision #4)."""

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
        self.assertEqual(res.data["filename"], "doc.txt")
        self.assertTrue(res.data["url"])
        listing = self.client.get(f"/api/leads/{self.lead.id}/attachments/")
        self.assertEqual(len(listing.data), 1)

    def test_oversize_rejected(self):
        self.client.force_authenticate(self.lead_manager)
        big = b"x" * (5 * 1024 * 1024 + 1)
        res = self._upload(content=big, name="big.bin")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", res.data)

    def test_owner_can_delete_but_other_manager_cannot(self):
        self.client.force_authenticate(self.lead_manager)
        att_id = self._upload().data["id"]
        # A different Lead Manager can't even see the lead → 404.
        self.client.force_authenticate(self.other_manager)
        res = self.client.delete(f"/api/attachments/{att_id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        # The owner can delete.
        self.client.force_authenticate(self.lead_manager)
        res = self.client.delete(f"/api/attachments/{att_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Attachment.objects.filter(id=att_id).exists())


class NotificationTests(WorkflowEngineTestBase):
    """Auto-notify on reassignment + follow-up; list / mark-read (Decision #4)."""

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

    def test_followup_notifies_assignee_and_list_and_mark_read(self):
        future = (timezone.now().date() + timedelta(days=3)).isoformat()
        self.client.force_authenticate(self.lead_manager)
        self.client.post(
            "/api/followups/",
            {"lead": self.lead.id, "title": "Ring back", "assigned_to": self.employee.id,
             "followup_date": future, "remark": ""},
            format="json",
        )
        self.client.force_authenticate(self.employee)
        listing = self.client.get("/api/notifications/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listing.data), 1)
        self.assertFalse(listing.data[0]["read"])
        note_id = listing.data[0]["id"]
        marked = self.client.post(f"/api/notifications/{note_id}/read/")
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        self.assertTrue(marked.data["read"])

    def test_mark_all_read_scoped_to_caller(self):
        Notification.objects.create(user=self.employee, type="followup", message="a")
        Notification.objects.create(user=self.employee, type="followup", message="b")
        Notification.objects.create(user=self.lead_manager, type="followup", message="c")
        self.client.force_authenticate(self.employee)
        res = self.client.post("/api/notifications/mark-all-read/")
        self.assertEqual(res.data["updated"], 2)
        self.assertEqual(Notification.objects.filter(user=self.lead_manager, is_read=False).count(), 1)

    def test_cannot_mark_others_notification(self):
        note = Notification.objects.create(user=self.lead_manager, type="followup", message="x")
        self.client.force_authenticate(self.employee)
        res = self.client.post(f"/api/notifications/{note.id}/read/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class DashboardTests(WorkflowEngineTestBase):
    """Leads-funnel aggregation, scoped own vs all (PRD §6)."""

    def test_lead_manager_sees_own_funnel(self):
        self.client.force_authenticate(self.lead_manager)
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_leads"], 1)
        statuses = {row["status"] for row in res.data["count_by_status"]}
        self.assertEqual(statuses, set(Lead.Status.values))
        self.assertEqual(res.data["active_lead_count"], 1)

    def test_lead_admin_sees_all_leads(self):
        Lead.objects.create(
            country=self.country, industry=self.industry, domain=self.area,
            company_name="Other", project_name="P2",
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
