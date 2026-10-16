from datetime import timedelta

from django.utils import timezone

from accounts.models import AdminActivity, AdminInvite
from accounts.tests.helpers import PASSWORD, AccountsTestCase
from utils.accounts import invites

INVITES = "/api/admin/invites/"
CHECK = "/api/invites/check/"
ACCEPT = "/api/invites/accept/"


def accept_body(token, email="new@example.com"):
    return {"token": token, "email": email, "display_name": "Awa", "password": PASSWORD}


class CreateInviteTest(AccountsTestCase):
    def test_owner_creates_invite_and_only_hash_is_stored(self):
        owner = self.make_owner()
        self.client.force_login(owner)
        response = self.client.post(INVITES)
        self.assertEqual(response.status_code, 201)
        token = response.json()["token"]
        invite = AdminInvite.objects.get()
        self.assertNotEqual(invite.token_hash, token)
        self.assertTrue(AdminActivity.objects.filter(action="invite_created", actor=owner).exists())

    def test_admin_and_visitor_cannot_create(self):
        self.assertEqual(self.client.post(INVITES).status_code, 403)
        self.client.force_login(self.make_admin())
        self.assertEqual(self.client.post(INVITES).status_code, 403)

    def test_list_shows_only_pending_and_revoke_works(self):
        owner = self.make_owner()
        pending, _ = invites.create_invite(owner)
        expired, _ = invites.create_invite(owner)
        expired.expires_at = timezone.now() - timedelta(minutes=1)
        expired.save()
        self.client.force_login(owner)
        ids = [row["id"] for row in self.client.get(INVITES).json()["results"]]
        self.assertEqual(ids, [pending.id])
        self.assertEqual(self.client.delete(f"{INVITES}{pending.id}/").status_code, 204)
        self.assertEqual(self.client.get(INVITES).json()["results"], [])
        self.assertEqual(self.client.delete(f"{INVITES}{pending.id}/").status_code, 404)


class AcceptInviteTest(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.invite, self.token = invites.create_invite(self.owner)

    def test_check_reports_valid_and_invalid_links(self):
        self.assertEqual(self.client.post(CHECK, {"token": self.token}).status_code, 200)
        self.assertEqual(self.client.post(CHECK, {"token": "made-up"}).status_code, 404)
        self.assertEqual(self.client.post(CHECK, {"token": "x" * 500}).status_code, 400)

    def test_accept_creates_admin_and_sends_to_setup(self):
        response = self.client.post(ACCEPT, accept_body(self.token, "New@Example.com"))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"next": "setup"})
        self.invite.refresh_from_db()
        self.assertIsNotNone(self.invite.accepted_at)
        self.assertEqual(self.invite.accepted_by.email, "new@example.com")
        self.assertEqual(list(self.invite.accepted_by.groups.values_list("name", flat=True)), ["admin"])
        self.assertTrue(AdminActivity.objects.filter(action="admin_joined").exists())
        # Joined, but not logged in until the second step is set up.
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 403)
        self.assertEqual(self.client.post("/api/auth/second-step/setup/").status_code, 200)

    def test_link_works_only_once(self):
        self.client.post(ACCEPT, accept_body(self.token))
        response = self.client.post(ACCEPT, accept_body(self.token, "other@example.com"))
        self.assertEqual(response.status_code, 400)

    def test_expired_and_revoked_links_fail(self):
        self.invite.expires_at = timezone.now() - timedelta(seconds=1)
        self.invite.save()
        self.assertEqual(self.client.post(ACCEPT, accept_body(self.token)).status_code, 400)
        invite, token = invites.create_invite(self.owner)
        invites.revoke_invite(invite.id, self.owner)
        self.assertEqual(self.client.post(ACCEPT, accept_body(token)).status_code, 400)

    def test_existing_email_in_any_case_is_refused(self):
        response = self.client.post(ACCEPT, accept_body(self.token, "OWNER@example.com"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("existe déjà", response.json()["detail"])
        self.invite.refresh_from_db()
        self.assertIsNone(self.invite.accepted_at)

    def test_weak_password_is_refused(self):
        body = accept_body(self.token)
        body["password"] = "12345678"
        self.assertEqual(self.client.post(ACCEPT, body).status_code, 400)
