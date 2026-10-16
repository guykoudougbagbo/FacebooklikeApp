from io import StringIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.management import CommandError, call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import AdminActivity, RecoveryCode
from accounts.tests.helpers import PASSWORD, AccountsTestCase, SecureAPIClient
from utils.accounts import roles

ADMINS = "/api/admin/admins/"
ACTIVITY = "/api/admin/activity/"
ME = "/api/auth/me/"


def permission_names(group):
    return {f"{p.content_type.app_label}.{p.codename}" for p in group.permissions.select_related("content_type")}


class RolesTest(AccountsTestCase):
    def test_groups_hold_exactly_the_registry_permissions(self):
        for role, names in roles.ROLE_PERMISSIONS.items():
            self.assertEqual(permission_names(Group.objects.get(name=role)), set(names))

    def test_owner_has_every_admin_permission(self):
        owner = self.make_owner()
        admin_perms = permission_names(Group.objects.get(name=roles.ADMIN))
        self.assertIn("posts.create_post", admin_perms)
        for name in admin_perms:
            self.assertTrue(owner.has_perm(name), name)

    def test_sync_repairs_drift(self):
        Group.objects.get(name=roles.ADMIN).permissions.clear()
        roles.sync_role_groups()
        self.assertEqual(permission_names(Group.objects.get(name=roles.ADMIN)), set(roles.ADMIN_PERMISSIONS))

    def test_role_of(self):
        self.assertEqual(roles.role_of(self.make_owner()), "owner")
        self.assertEqual(roles.role_of(self.make_admin()), "admin")


class CreateOwnerCommandTest(AccountsTestCase):
    def run_command(self, passwords, email="boss@example.com"):
        with mock.patch("accounts.management.commands.create_owner.getpass", side_effect=passwords):
            call_command("create_owner", email=email, display_name="Boss", stdout=StringIO())

    def test_creates_owner_once(self):
        self.run_command([PASSWORD, PASSWORD])
        self.assertTrue(roles.owner_exists())
        with self.assertRaisesMessage(CommandError, "already exists"):
            self.run_command([PASSWORD, PASSWORD], email="second@example.com")

    def test_rejects_mismatch_weak_password_and_bad_email(self):
        with self.assertRaises(CommandError):
            self.run_command([PASSWORD, PASSWORD + "x"])
        with self.assertRaises(CommandError):
            self.run_command(["12345678", "12345678"])
        with self.assertRaises(CommandError):
            self.run_command([PASSWORD, PASSWORD], email="not-an-email")
        self.assertFalse(roles.owner_exists())


class AdminListTest(AccountsTestCase):
    def test_admins_and_owner_can_list_visitors_cannot(self):
        owner = self.make_owner()
        admin = self.make_admin()
        self.assertEqual(self.client.get(ADMINS).status_code, 403)
        self.client.force_login(admin)
        rows = self.client.get(ADMINS).json()["results"]
        self.assertEqual([(r["email"], r["role"]) for r in rows], [(owner.email, "owner"), (admin.email, "admin")])

    def test_query_count_does_not_grow_with_admins(self):
        self.client.force_login(self.make_owner())
        self.make_admin("a1@example.com")
        with CaptureQueriesContext(connection) as few:
            self.client.get(ADMINS)
        for i in range(5):
            self.make_admin(f"more{i}@example.com")
        with CaptureQueriesContext(connection) as many:
            self.client.get(ADMINS)
        self.assertEqual(len(few), len(many))


class RemoveAndResetTest(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.admin = self.make_admin()
        self.admin_client = SecureAPIClient()
        self.admin_client.force_login(self.admin)
        self.client.force_login(self.owner)

    def test_owner_removes_admin_and_their_sessions_end(self):
        self.assertEqual(self.admin_client.get(ME).status_code, 200)
        self.assertEqual(self.client.post(f"{ADMINS}{self.admin.id}/remove/").status_code, 204)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)
        self.assertEqual(self.admin_client.get(ME).status_code, 403)
        self.assertTrue(AdminActivity.objects.filter(action="admin_removed", target_user=self.admin).exists())

    def test_cannot_remove_owner_or_self_and_admin_cannot_remove(self):
        self.assertEqual(self.client.post(f"{ADMINS}{self.owner.id}/remove/").status_code, 400)
        self.assertEqual(self.admin_client.post(f"{ADMINS}{self.owner.id}/remove/").status_code, 403)
        self.assertEqual(self.client.post(f"{ADMINS}999999/remove/").status_code, 400)

    def test_reset_second_step_clears_app_and_codes_and_ends_sessions(self):
        self.add_device(self.admin)
        RecoveryCode.objects.create(user=self.admin, code_hash="x" * 64)
        response = self.client.post(f"{ADMINS}{self.admin.id}/reset-second-step/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TOTPDevice.objects.filter(user=self.admin).exists())
        self.assertFalse(RecoveryCode.objects.filter(user=self.admin).exists())
        self.assertEqual(self.admin_client.get(ME).status_code, 403)
        login = SecureAPIClient().post("/api/auth/login/", {"email": self.admin.email, "password": PASSWORD})
        self.assertEqual(login.json(), {"next": "setup"})

    def test_admin_cannot_reset(self):
        response = self.admin_client.post(f"{ADMINS}{self.owner.id}/reset-second-step/")
        self.assertEqual(response.status_code, 403)


class ActivityTest(AccountsTestCase):
    def test_admins_see_activity_newest_first_without_extra_queries(self):
        owner = self.make_owner()
        admin = self.make_admin()
        self.client.force_login(owner)
        self.client.post("/api/admin/invites/")
        self.client.post(f"{ADMINS}{admin.id}/reset-second-step/")
        viewer = SecureAPIClient()
        viewer.force_login(self.make_admin("viewer@example.com"))
        with CaptureQueriesContext(connection) as queries:
            rows = viewer.get(ACTIVITY).json()["results"]
        self.assertEqual([r["action"] for r in rows], ["two_factor_reset", "invite_created"])
        self.assertEqual(rows[0]["target"], admin.display_name)
        self.assertLess(len(queries), 8)

    def test_visitors_cannot_see_activity(self):
        self.assertEqual(self.client.get(ACTIVITY).status_code, 403)
