from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import AdminActivity, AdminInvite, RecoveryCode
from accounts.tests.helpers import PASSWORD, AccountsTestCase, SecureAPIClient
from utils.accounts import admins, invites

FORMER = "/api/admin/former-admins/"
CHECK = "/api/invites/check/"
ACCEPT = "/api/invites/accept/"
REACTIVATE = "/api/invites/reactivate/"
LOGIN = "/api/auth/login/"
NEW_PASSWORD = "Un-nouveau-mot-de-passe-2026"


class ReinviteTest(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        # The admin joins through a normal invite, so coming back means a second accepted invite.
        _, token = invites.create_invite(self.owner)
        self.admin = invites.accept_invite(token, "koffi@example.com", "Koffi", PASSWORD)
        self.old_session = SecureAPIClient()
        self.old_session.force_login(self.admin)
        self.add_device(self.admin)
        RecoveryCode.objects.create(user=self.admin, code_hash="a" * 64)
        admins.remove_admin(self.admin.id, self.owner)
        self.client.force_login(self.owner)

    def reinvite(self):
        response = self.client.post(f"{FORMER}{self.admin.id}/reinvite/")
        self.assertEqual(response.status_code, 201)
        return response.json()["token"]

    def test_owner_sees_former_admins_only(self):
        self.make_admin("active@example.com")
        rows = self.client.get(FORMER).json()["results"]
        self.assertEqual([r["email"] for r in rows], ["koffi@example.com"])

    def test_admins_and_visitors_cannot_list_or_reinvite(self):
        admin_client = SecureAPIClient()
        admin_client.force_login(self.make_admin("active@example.com"))
        self.assertEqual(admin_client.get(FORMER).status_code, 403)
        self.assertEqual(admin_client.post(f"{FORMER}{self.admin.id}/reinvite/").status_code, 403)
        self.assertEqual(SecureAPIClient().get(FORMER).status_code, 403)

    def test_only_removed_admins_can_be_reinvited(self):
        active = self.make_admin("active@example.com")
        for target in (active.id, self.owner.id, 999999):
            self.assertEqual(self.client.post(f"{FORMER}{target}/reinvite/").status_code, 404)

    def test_new_reinvite_cancels_the_previous_one(self):
        first = self.reinvite()
        second = self.reinvite()
        self.assertEqual(self.client.post(CHECK, {"token": first}).status_code, 404)
        self.assertEqual(self.client.post(CHECK, {"token": second}).status_code, 200)

    def test_check_tells_the_page_which_form_to_show(self):
        token = self.reinvite()
        body = SecureAPIClient().post(CHECK, {"token": token}).json()
        self.assertEqual((body["kind"], body["display_name"], body["email"]), ("reactivate", "Koffi", "koffi@example.com"))
        _, new_token = invites.create_invite(self.owner)
        self.assertEqual(SecureAPIClient().post(CHECK, {"token": new_token}).json()["kind"], "new")

    def test_reactivation_switches_the_account_back_on_with_a_fresh_start(self):
        token = self.reinvite()
        visitor = SecureAPIClient()
        response = visitor.post(REACTIVATE, {"token": token, "password": NEW_PASSWORD})
        self.assertEqual(response.json(), {"next": "setup"})
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertEqual(self.admin.display_name, "Koffi")
        self.assertFalse(TOTPDevice.objects.filter(user=self.admin).exists())
        self.assertFalse(RecoveryCode.objects.filter(user=self.admin).exists())
        self.assertEqual(self.old_session.get("/api/auth/me/").status_code, 403)
        self.assertEqual(SecureAPIClient().post(LOGIN, {"email": self.admin.email, "password": PASSWORD}).status_code, 400)
        self.assertEqual(
            SecureAPIClient().post(LOGIN, {"email": self.admin.email, "password": NEW_PASSWORD}).json(), {"next": "setup"}
        )
        self.assertEqual(AdminInvite.objects.filter(accepted_by=self.admin).count(), 2)
        self.assertTrue(AdminActivity.objects.filter(action="admin_reinvited", actor=self.owner, target_user=self.admin).exists())
        self.assertTrue(AdminActivity.objects.filter(action="admin_rejoined", target_user=self.admin).exists())

    def test_reactivation_link_works_once(self):
        token = self.reinvite()
        SecureAPIClient().post(REACTIVATE, {"token": token, "password": NEW_PASSWORD})
        again = SecureAPIClient().post(REACTIVATE, {"token": token, "password": NEW_PASSWORD + "x"})
        self.assertEqual(again.status_code, 400)

    def test_weak_password_keeps_the_account_off(self):
        token = self.reinvite()
        response = SecureAPIClient().post(REACTIVATE, {"token": token, "password": "12345678"})
        self.assertEqual(response.status_code, 400)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)

    def test_a_normal_invite_cannot_take_over_a_removed_account(self):
        _, token = invites.create_invite(self.owner)
        body = {"token": token, "email": "KOFFI@example.com", "display_name": "Imposteur", "password": NEW_PASSWORD}
        response = SecureAPIClient().post(ACCEPT, body)
        self.assertEqual(response.status_code, 400)
        self.assertIn("ancien administrateur", response.json()["detail"])
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)
        self.assertEqual(self.admin.display_name, "Koffi")
        self.assertEqual(SecureAPIClient().post(REACTIVATE, {"token": token, "password": NEW_PASSWORD}).status_code, 400)

    def test_a_reinvite_link_cannot_create_a_new_account(self):
        token = self.reinvite()
        body = {"token": token, "email": "someone@example.com", "display_name": "Someone", "password": NEW_PASSWORD}
        self.assertEqual(SecureAPIClient().post(ACCEPT, body).status_code, 400)
