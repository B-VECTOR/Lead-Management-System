"""Reference-table API tests (Tech Req §4.2).

Phase 14f: every reference table carries a status column (v13) and the list
endpoints offer only active rows — inactivating retires an entry from the
dropdowns without breaking existing FKs.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from authentication.models import Belt
from .models import Area, Country, Industry


class ActiveOnlyDropdownTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="ref-tester",
            email="ref-tester@example.com",
            password="pass12345",
            name="Ref Tester",
            employee_id=990001,
            mobile_no=9990000001,
            date_of_joining="2026-01-01",
        )
        self.client.force_authenticate(self.user)

    def _names(self, url):
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        return {row["name"] for row in res.data}

    def test_inactive_reference_rows_hidden_from_lists(self):
        for model, url in (
            (Country, "/api/countries/"),
            (Industry, "/api/industries/"),
            (Area, "/api/areas/"),
        ):
            model.objects.create(name="Active X", code=f"AX{model.__name__[:2]}")
            model.objects.create(
                name="Retired X",
                code=f"RX{model.__name__[:2]}",
                status=model.Status.INACTIVE,
            )
            names = self._names(url)
            self.assertIn("Active X", names)
            self.assertNotIn("Retired X", names)

    def test_inactive_belt_hidden_from_list(self):
        Belt.objects.create(name="Active Belt", order=98)
        Belt.objects.create(name="Retired Belt", order=99, status=Belt.Status.INACTIVE)
        names = self._names("/api/belts/")
        self.assertIn("Active Belt", names)
        self.assertNotIn("Retired Belt", names)
