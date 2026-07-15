from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from reference.models import Area

from .models import Belt, PasswordResetToken

User = get_user_model()


class UserManagerTests(TestCase):
    def setUp(self):
        self.belt = Belt.objects.create(name="Green", order=1)
        self.area = Area.objects.create(name="Manufacturing", code="MFG")
        # All model fields are required, so callers must supply them.
        self.required = dict(
            email="user@example.com",
            name="Ada Lovelace",
            employee_id=1,
            mobile_no=9876543210,
            belt=self.belt,
            acting_belt_level=self.belt,
            domain=self.area,
            date_of_joining="2024-01-15",
        )

    def test_create_user(self):
        user = User.objects.create_user(
            username="ada", password="pass1234", **self.required
        )
        self.assertEqual(user.username, "ada")
        self.assertEqual(user.email, "user@example.com")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_user_requires_username(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(
                username="", password="pass1234", **self.required
            )

    def test_create_user_requires_email(self):
        required = {**self.required}
        del required["email"]
        with self.assertRaises(ValueError):
            User.objects.create_user(
                username="ada", email="", password="pass1234", **required
            )

    def test_create_superuser(self):
        admin = User.objects.create_superuser(
            username="admin", password="pass1234", **self.required
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_create_superuser_must_have_is_staff(self):
        with self.assertRaises(ValueError):
            User.objects.create_superuser(
                username="admin",
                password="pass1234",
                is_staff=False,
                **self.required,
            )


class UserRequiredFieldTests(TestCase):
    def setUp(self):
        self.belt = Belt.objects.create(name="Green", order=1)
        self.area = Area.objects.create(name="Manufacturing", code="MFG")

    def test_belt_and_domain_are_optional(self):
        # belt / acting_belt_level / domain may be left unset.
        user = User.objects.create_user(
            username="ada",
            email="member@example.com",
            password="pass1234",
            name="Ada Lovelace",
            employee_id=2,
            mobile_no=9876543210,
            date_of_joining="2024-01-15",
        )
        self.assertIsNone(user.belt)
        self.assertIsNone(user.acting_belt_level)
        self.assertIsNone(user.domain)

    def test_all_fields_populated(self):
        user = User.objects.create_user(
            username="ada",
            email="member@example.com",
            password="pass1234",
            name="Ada Lovelace",
            employee_id=3,
            mobile_no=9876543210,
            belt=self.belt,
            acting_belt_level=self.belt,
            domain=self.area,
            date_of_joining="2024-01-15",
        )
        self.assertEqual(user.get_full_name(), "Ada Lovelace")
        self.assertEqual(user.employee_id, 3)
        self.assertEqual(user.belt, self.belt)
        self.assertEqual(user.domain, self.area)
        self.assertEqual(self.belt.users.count(), 1)
        self.assertEqual(self.belt.acting_users.count(), 1)
        self.assertEqual(self.area.users.count(), 1)


class UserCrudApiTests(APITestCase):
    """Exercise the `/api/users/` CRUD endpoint and its permission gating."""

    def setUp(self):
        self.belt = Belt.objects.create(name="Green", order=1)
        self.area = Area.objects.create(name="Manufacturing", code="MFG")
        self.other_area = Area.objects.create(name="Quality", code="QA")
        self.payload = {
            "username": "ada",
            "email": "member@example.com",
            "password": "Tr0ub4dor&3xyz",
            "name": "Ada Lovelace",
            "employee_id": 1001,
            "mobile_no": 9876543210,
            "belt": self.belt.pk,
            "domain": self.area.pk,
            "date_of_joining": "2024-01-15",
        }

        # A "user management" operator: authenticated + granted the model
        # permissions a User Managers group would hold, but not a superuser.
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="pass1234",
            name="Manager User",
            employee_id=9001,
            mobile_no=9876500000,
            date_of_joining="2023-01-01",
        )
        self.manager.user_permissions.add(
            *Permission.objects.filter(
                content_type__app_label="authentication",
                codename__in=[
                    "add_user",
                    "change_user",
                    "delete_user",
                    "view_user",
                ],
            )
        )

        # An authenticated user with no user-management permissions.
        self.plain_user = User.objects.create_user(
            username="plain",
            email="plain@example.com",
            password="pass1234",
            name="Plain User",
            employee_id=9002,
            mobile_no=9876511111,
            date_of_joining="2023-01-01",
        )

    def test_anonymous_cannot_list(self):
        response = self.client.get("/api/users/")
        self.assertIn(
            response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )

    def test_authenticated_without_permission_cannot_list(self):
        self.client.force_authenticate(self.plain_user)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_management_holders_hidden_from_listing(self):
        # User Management is an exclusive role managed only via the Django admin;
        # its holders never appear in the app's user listing or CRUD-by-id.
        um_user = User.objects.create_user(
            username="umadmin",
            email="um@example.com",
            password="pass1234",
            name="UM Admin",
            employee_id=9003,
            mobile_no=9876522222,
            date_of_joining="2023-01-01",
        )
        um_user.groups.add(Group.objects.get_or_create(name="user_management")[0])
        self.client.force_authenticate(self.manager)

        listing = self.client.get("/api/users/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertNotIn(um_user.id, {row["id"] for row in listing.data["results"]})

        detail = self.client.get(f"/api/users/{um_user.id}/")
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_manager_can_create_list_retrieve_update_delete(self):
        self.client.force_authenticate(self.manager)

        # Create
        response = self.client.post("/api/users/", self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user_id = response.data["id"]
        self.assertEqual(response.data["username"], "ada")
        self.assertNotIn("password", response.data)
        created = User.objects.get(pk=user_id)
        self.assertTrue(created.check_password(self.payload["password"]))
        self.assertEqual(created.employee_id, 1001)

        # List
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [item["username"] for item in response.data["results"]]
        self.assertIn("ada", usernames)

        # Retrieve
        response = self.client.get(f"/api/users/{user_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "member@example.com")

        # Update (domain is now an FK — send the Area pk)
        response = self.client.patch(
            f"/api/users/{user_id}/", {"domain": self.other_area.pk}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["domain"], self.other_area.pk)

        # Delete (soft delete: hidden from the default manager, row kept)
        response = self.client.delete(f"/api/users/{user_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=user_id).exists())
        deleted = User.all_objects.get(pk=user_id)
        self.assertTrue(deleted.is_deleted)
        self.assertFalse(deleted.is_active)

    def test_create_requires_password(self):
        self.client.force_authenticate(self.manager)
        payload = {**self.payload}
        del payload["password"]
        response = self.client.post("/api/users/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_create_rejects_duplicate_username(self):
        self.client.force_authenticate(self.manager)
        payload = {**self.payload, "username": self.manager.username}
        response = self.client.post("/api/users/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_create_rejects_negative_employee_id(self):
        self.client.force_authenticate(self.manager)
        payload = {**self.payload, "employee_id": -5}
        response = self.client.post("/api/users/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("employee_id", response.data)

    def test_response_never_exposes_password(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post("/api/users/", self.payload, format="json")
        self.assertNotIn("password", response.data)

    def test_manager_cannot_delete_own_account(self):
        self.client.force_authenticate(self.manager)
        response = self.client.delete(f"/api/users/{self.manager.pk}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.manager.pk).exists())

    def test_manager_cannot_deactivate_own_account(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            f"/api/users/{self.manager.pk}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    def test_manager_can_deactivate_other_user(self):
        # The self-lockout guard only blocks acting on your own account.
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            f"/api/users/{self.plain_user.pk}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.plain_user.refresh_from_db()
        self.assertFalse(self.plain_user.is_active)


class AuthTokenTests(APITestCase):
    """Login now authenticates by username, not email (Phase 2)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ada",
            email="member@example.com",
            password="OldPass123!",
            name="Member User",
            employee_id=1,
            mobile_no=9876543210,
            date_of_joining="2024-01-15",
        )

    def test_login_with_username_succeeds(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "ada", "password": "OldPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "ada")
        self.assertEqual(response.data["user"]["email"], "member@example.com")

    def test_login_with_email_fails(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "member@example.com", "password": "OldPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_refresh_and_logout(self):
        login = self.client.post(
            "/api/auth/login/",
            {"username": "ada", "password": "OldPass123!"},
            format="json",
        )
        refresh = login.data["refresh"]

        refreshed = self.client.post(
            "/api/auth/refresh/", {"refresh": refresh}, format="json"
        )
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        self.assertIn("access", refreshed.data)

        # Refresh-token rotation blacklists the old token, so log out with the
        # rotated one (fall back to the original if rotation is off).
        current_refresh = refreshed.data.get("refresh", refresh)
        self.client.force_authenticate(self.user)
        logout = self.client.post(
            "/api/auth/logout/", {"refresh": current_refresh}, format="json"
        )
        self.assertEqual(logout.status_code, status.HTTP_205_RESET_CONTENT)


class ChangeOwnPasswordApiTests(APITestCase):
    """Exercise the self-service `/api/auth/change-password/` endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ada",
            email="member@example.com",
            password="OldPass123!",
            name="Member User",
            employee_id=1,
            mobile_no=9876543210,
            date_of_joining="2024-01-15",
        )

    def test_anonymous_cannot_change_password(self):
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "NewPass456!"},
            format="json",
        )
        self.assertIn(
            response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        )

    def test_wrong_current_password_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "WrongPass!", "new_password": "NewPass456!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass123!"))

    def test_weak_new_password_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)

    def test_correct_current_password_changes_it(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "OldPass123!", "new_password": "NewPass456!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456!"))


class UserManagementPageTests(TestCase):
    """Exercise the template-rendered `/users/manage/...` pages."""

    def setUp(self):
        self.belt = Belt.objects.create(name="Green", order=1)
        self.area = Area.objects.create(name="Quality", code="QA")

        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="Tr0ub4dor&3mgr",
            name="Manager User",
            employee_id=9001,
            mobile_no=9876500000,
            date_of_joining="2023-01-01",
        )
        self.manager.user_permissions.add(
            *Permission.objects.filter(
                content_type__app_label="authentication",
                codename__in=[
                    "add_user",
                    "change_user",
                    "delete_user",
                    "view_user",
                ],
            )
        )

        self.plain_user = User.objects.create_user(
            username="plain",
            email="plain@example.com",
            password="Tr0ub4dor&3usr",
            name="Plain User",
            employee_id=9002,
            mobile_no=9876511111,
            date_of_joining="2023-01-01",
        )

        self.target = User.objects.create_user(
            username="target",
            email="target@example.com",
            password="Tr0ub4dor&3tgt",
            name="Target User",
            employee_id=9003,
            mobile_no=9876522222,
            belt=self.belt,
            date_of_joining="2023-06-01",
        )

    def test_anonymous_redirected_to_login(self):
        response = self.client.get("/users/manage/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/accounts/login/", response.url)

    def test_authenticated_without_permission_is_forbidden(self):
        self.client.force_login(self.plain_user)
        response = self.client.get("/users/manage/")
        self.assertEqual(response.status_code, 403)

    def test_manager_can_list_users(self):
        self.client.force_login(self.manager)
        response = self.client.get("/users/manage/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "target@example.com")

    def test_manager_can_create_user(self):
        self.client.force_login(self.manager)
        response = self.client.post(
            "/users/manage/create/",
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password1": "Tr0ub4dor&3new",
                "password2": "Tr0ub4dor&3new",
                "name": "New User",
                "employee_id": 9004,
                "mobile_no": 9876533333,
                "domain": "",
                "date_of_joining": "2024-01-01",
            },
        )
        self.assertRedirects(response, "/users/manage/")
        self.assertTrue(User.objects.filter(username="newuser").exists())

    def test_manager_can_update_user(self):
        self.client.force_login(self.manager)
        response = self.client.post(
            f"/users/manage/{self.target.pk}/edit/",
            {
                "username": self.target.username,
                "email": self.target.email,
                "name": self.target.name,
                "employee_id": self.target.employee_id,
                "mobile_no": self.target.mobile_no,
                "domain": self.area.pk,
                "date_of_joining": "2023-06-01",
                "is_active": "on",
            },
        )
        self.assertRedirects(response, "/users/manage/")
        self.target.refresh_from_db()
        self.assertEqual(self.target.domain, self.area)

    def test_manager_can_soft_delete_and_restore_user(self):
        self.client.force_login(self.manager)

        # Soft delete
        response = self.client.post(f"/users/manage/{self.target.pk}/delete/")
        self.assertRedirects(response, "/users/manage/")
        self.assertFalse(User.objects.filter(pk=self.target.pk).exists())
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_deleted)
        self.assertFalse(self.target.is_active)

        # Hidden from the default list, visible with show_deleted=1
        response = self.client.get("/users/manage/")
        self.assertNotContains(response, "target@example.com")
        response = self.client.get("/users/manage/?show_deleted=1")
        self.assertContains(response, "target@example.com")

        # A soft-deleted user cannot log in (login is by username).
        self.assertFalse(
            self.client.login(username="target", password="Tr0ub4dor&3tgt")
        )

        # Restore
        response = self.client.post(f"/users/manage/{self.target.pk}/restore/")
        self.assertEqual(response.status_code, 302)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_deleted)
        self.assertTrue(self.target.is_active)
        self.assertTrue(User.objects.filter(pk=self.target.pk).exists())

    def test_delete_requires_post(self):
        self.client.force_login(self.manager)
        response = self.client.get(f"/users/manage/{self.target.pk}/delete/")
        self.assertEqual(response.status_code, 405)

    def test_manager_cannot_soft_delete_own_account(self):
        self.client.force_login(self.manager)
        response = self.client.post(f"/users/manage/{self.manager.pk}/delete/")
        self.assertRedirects(response, "/users/manage/")
        self.assertTrue(User.objects.filter(pk=self.manager.pk).exists())
        self.manager.refresh_from_db()
        self.assertFalse(self.manager.is_deleted)

    def test_manager_cannot_deactivate_own_account_via_edit(self):
        self.client.force_login(self.manager)
        response = self.client.post(
            f"/users/manage/{self.manager.pk}/edit/",
            {
                "username": self.manager.username,
                "email": self.manager.email,
                "name": self.manager.name,
                "employee_id": self.manager.employee_id,
                "mobile_no": self.manager.mobile_no,
                "domain": "",
                "date_of_joining": "2023-01-01",
                # is_active omitted == the checkbox left unchecked.
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "You cannot deactivate your own account.")
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)


class MeEndpointTests(APITestCase):
    """`/api/auth/me/` returns the authenticated user's own profile (Phase 8)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ada", email="ada@example.com", password="OldPass123!",
            name="Ada L", employee_id=1, mobile_no=9876543210,
            date_of_joining="2024-01-15",
        )

    def test_anonymous_rejected(self):
        res = self.client.get("/api/auth/me/")
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_returns_own_profile(self):
        self.client.force_authenticate(self.user)
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "ada")
        self.assertEqual(res.data["email"], "ada@example.com")


class PasswordResetFlowTests(APITestCase):
    """Forgot-password: request → verify → confirm (Phase 8)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="ada", email="ada@example.com", password="OldPass123!",
            name="Ada L", employee_id=1, mobile_no=9876543210,
            date_of_joining="2024-01-15",
        )

    def test_request_creates_token_and_is_generic(self):
        res = self.client.post(
            "/api/auth/password-reset/", {"email": "ada@example.com"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(PasswordResetToken.objects.filter(user=self.user).exists())

    def test_unknown_email_still_200_no_token(self):
        res = self.client.post(
            "/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(PasswordResetToken.objects.count(), 0)

    def test_verify_and_confirm(self):
        token = PasswordResetToken.objects.create(user=self.user)
        verify = self.client.get(f"/api/auth/password-reset/{token.token}/")
        self.assertEqual(verify.status_code, status.HTTP_200_OK)
        self.assertTrue(verify.data["valid"])
        self.assertEqual(verify.data["email"], "ada@example.com")

        confirm = self.client.post(
            f"/api/auth/password-reset/{token.token}/",
            {"new_password": "BrandNew789!"}, format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNew789!"))
        token.refresh_from_db()
        self.assertTrue(token.used)

    def test_used_token_is_rejected(self):
        token = PasswordResetToken.objects.create(user=self.user, used=True)
        verify = self.client.get(f"/api/auth/password-reset/{token.token}/")
        self.assertEqual(verify.status_code, status.HTTP_404_NOT_FOUND)
        confirm = self.client.post(
            f"/api/auth/password-reset/{token.token}/",
            {"new_password": "BrandNew789!"}, format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(DEBUG=True)
    def test_debug_returns_reset_link(self):
        res = self.client.post(
            "/api/auth/password-reset/", {"email": "ada@example.com"}, format="json"
        )
        self.assertIn("reset_url", res.data)
        self.assertIn("token", res.data)
