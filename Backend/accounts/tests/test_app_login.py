from datetime import timedelta
from unittest import mock

from django.core import signing
from django.test import override_settings
from django.utils import timezone

from accounts.models import AppLogin
from accounts.tests.helpers import PASSWORD, AccountsTestCase, SecureAPIClient, current_code
from utils.accounts import admins, app_logins
from utils.accounts.throttles import AppSecondStepThrottle

LOGIN, VERIFY, SETUP, CONFIRM = "/api/app/auth/login/", "/api/app/auth/verify/", "/api/app/auth/setup/", "/api/app/auth/confirm/"
TOKEN = "ExponentPushToken[abcDEF123_-]"


class AppLoginTestCase(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.device = self.add_device(self.owner)
        # The app sends no cookies and no CSRF token; enforcing CSRF proves these routes don't depend on it.
        self.app = SecureAPIClient(enforce_csrf_checks=True)

    def ticket(self, email="owner@example.com"):
        response = self.app.post(LOGIN, {"email": email, "password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def log_in(self):
        ticket = self.ticket()["ticket"]
        return self.app.post(VERIFY, {"ticket": ticket, "code": current_code(self.device)}, format="json").json()["key"]

    def another_phone(self):
        # An authenticator code works only once, so further phones are logged in directly.
        return app_logins.create(self.owner)

    def as_app(self, key):
        return {"HTTP_AUTHORIZATION": f"Bearer {key}"}


class LoginStepsTest(AppLoginTestCase):
    def test_password_then_code_gives_a_key_that_works_without_cookies_or_csrf(self):
        started = self.ticket()
        self.assertEqual(started["next"], "verify")
        response = self.app.post(VERIFY, {"ticket": started["ticket"], "code": current_code(self.device)}, format="json")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["user"]["role"], "owner")
        self.assertNotIn("sessionid", response.cookies)
        self.assertNotEqual(AppLogin.objects.get().key_hash, body["key"])
        me = SecureAPIClient(enforce_csrf_checks=True)
        self.assertEqual(me.get("/api/auth/me/", **self.as_app(body["key"])).json()["email"], "owner@example.com")
        created = me.post("/api/admin/invites/", **self.as_app(body["key"]))
        self.assertEqual(created.status_code, 201)

    def test_wrong_password_wrong_code_and_bad_tickets_are_refused(self):
        self.assertEqual(self.app.post(LOGIN, {"email": "owner@example.com", "password": "nope"}, format="json").status_code, 400)
        ticket = self.ticket()["ticket"]
        self.assertEqual(self.app.post(VERIFY, {"ticket": ticket, "code": "000000"}, format="json").status_code, 400)
        forged = signing.dumps({"user": self.owner.pk, "epoch": 0}, salt="something-else")
        self.assertEqual(self.app.post(VERIFY, {"ticket": forged, "code": current_code(self.device)}, format="json").status_code, 401)
        with override_settings(LOGIN_PENDING_TTL_SECONDS=-1):
            self.assertEqual(self.app.post(VERIFY, {"ticket": ticket, "code": current_code(self.device)}, format="json").status_code, 401)
        self.assertFalse(AppLogin.objects.exists())

    def test_a_ticket_stops_working_once_the_admin_is_logged_out_everywhere(self):
        ticket = self.ticket()["ticket"]
        self.owner.session_epoch += 1
        self.owner.save(update_fields=["session_epoch"])
        self.assertEqual(self.app.post(VERIFY, {"ticket": ticket, "code": current_code(self.device)}, format="json").status_code, 401)

    def test_first_login_sets_up_the_authenticator_in_the_app(self):
        admin = self.make_admin()
        started = self.ticket("admin@example.com")
        self.assertEqual(started["next"], "setup")
        setup = self.app.post(SETUP, {"ticket": started["ticket"]}, format="json").json()
        self.assertTrue(setup["otpauth_url"].startswith("otpauth://totp/"))
        device = admin.totpdevice_set.get()
        confirmed = self.app.post(CONFIRM, {"ticket": started["ticket"], "code": current_code(device)}, format="json").json()
        self.assertEqual(len(confirmed["recovery_codes"]), 10)
        self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app(confirmed["key"])).status_code, 200)

    def test_code_guesses_are_limited_per_account(self):
        ticket = self.ticket()["ticket"]
        with mock.patch.object(AppSecondStepThrottle, "rate", "2/h", create=True):
            for _ in range(2):
                self.app.post(VERIFY, {"ticket": ticket, "code": "000000"}, format="json")
            other = SecureAPIClient(REMOTE_ADDR="10.9.9.9")
            self.assertEqual(other.post(VERIFY, {"ticket": ticket, "code": current_code(self.device)}, format="json").status_code, 429)


class EndingLoginsTest(AppLoginTestCase):
    def test_logging_out_ends_this_phone_only(self):
        first, second = self.log_in(), self.another_phone()
        client = SecureAPIClient()
        self.assertEqual(client.post("/api/app/auth/logout/", **self.as_app(first)).status_code, 204)
        self.assertEqual(client.get("/api/auth/me/", **self.as_app(first)).status_code, 401)
        self.assertEqual(client.get("/api/auth/me/", **self.as_app(second)).status_code, 200)

    def test_removal_and_authenticator_reset_end_app_logins_at_once(self):
        admin = self.make_admin()
        device = self.add_device(admin)
        ticket = self.ticket("admin@example.com")["ticket"]
        key = self.app.post(VERIFY, {"ticket": ticket, "code": current_code(device)}, format="json").json()["key"]
        admins.reset_two_factor(admin.pk, self.owner)
        self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app(key)).status_code, 401)
        owner_key = self.log_in()
        admins.remove_admin(admin.pk, self.owner)
        self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app(owner_key)).status_code, 200)

    def test_a_login_unused_for_too_long_ends_and_use_keeps_it_alive(self):
        key = self.log_in()
        login = AppLogin.objects.get()
        with override_settings(APP_LOGIN_IDLE_SECONDS=3600, APP_LOGIN_TOUCH_SECONDS=60):
            AppLogin.objects.filter(pk=login.pk).update(last_used_at=timezone.now() - timedelta(minutes=30))
            self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app(key)).status_code, 200)
            login.refresh_from_db()
            self.assertGreater(login.last_used_at, timezone.now() - timedelta(minutes=1))
            AppLogin.objects.filter(pk=login.pk).update(last_used_at=timezone.now() - timedelta(hours=2))
            self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app(key)).status_code, 401)

    def test_a_wrong_key_is_refused_even_on_public_routes(self):
        self.assertEqual(SecureAPIClient().get("/api/auth/me/", **self.as_app("nope")).status_code, 401)
        self.assertEqual(SecureAPIClient().get("/api/posts/", **self.as_app("nope")).status_code, 401)

    def test_clean_up_job_only_logs_until_switched_on(self):
        self.log_in()
        fresh = self.another_phone()
        AppLogin.objects.exclude(pk=app_logins.find(fresh).pk).update(last_used_at=timezone.now() - timedelta(days=30))
        with self.assertLogs("utils.accounts.app_logins", "WARNING") as logs:
            self.assertEqual(app_logins.prune_expired(), {"stale": 1, "deleted": 0})
        self.assertIn("log-only", logs.output[0])
        with override_settings(APP_LOGIN_PRUNE_APPLY=True), self.assertLogs("utils.accounts.app_logins", "WARNING"):
            self.assertEqual(app_logins.prune_expired()["deleted"], 1)
        self.assertEqual(AppLogin.objects.count(), 1)


class PushTokenTest(AppLoginTestCase):
    def test_a_phone_registers_its_token_which_follows_whoever_logs_in_last(self):
        first, second = self.log_in(), self.another_phone()
        client = SecureAPIClient()
        self.assertEqual(client.put("/api/app/auth/push-token/", {"expo_token": TOKEN}, format="json", **self.as_app(first)).status_code, 204)
        client.put("/api/app/auth/push-token/", {"expo_token": TOKEN}, format="json", **self.as_app(second))
        self.assertEqual(AppLogin.objects.get(push_token=TOKEN), app_logins.find(second))
        self.assertEqual(AppLogin.objects.filter(push_token__isnull=False).count(), 1)
        self.assertEqual(client.delete("/api/app/auth/push-token/", **self.as_app(second)).status_code, 204)
        self.assertFalse(AppLogin.objects.filter(push_token__isnull=False).exists())

    def test_only_expo_tokens_from_the_app_are_accepted(self):
        key = self.log_in()
        bad = SecureAPIClient().put("/api/app/auth/push-token/", {"expo_token": "https://evil.example"}, format="json", **self.as_app(key))
        self.assertEqual(bad.status_code, 400)
        website = SecureAPIClient()
        website.force_login(self.owner)
        self.assertEqual(website.put("/api/app/auth/push-token/", {"expo_token": TOKEN}, format="json").status_code, 400)
