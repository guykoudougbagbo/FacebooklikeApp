import hashlib
import time
from unittest import mock

from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import RecoveryCode
from accounts.tests.helpers import PASSWORD, AccountsTestCase, SecureAPIClient, current_code
from utils.accounts import sessions
from utils.accounts.throttles import LoginAccountThrottle, SecondStepThrottle

LOGIN = "/api/auth/login/"
VERIFY = "/api/auth/second-step/verify/"
SETUP = "/api/auth/second-step/setup/"
CONFIRM = "/api/auth/second-step/confirm/"
ME = "/api/auth/me/"
LOGOUT = "/api/auth/logout/"


class PasswordStepTest(AccountsTestCase):
    def test_wrong_password_and_unknown_email_get_the_same_answer(self):
        self.make_owner()
        wrong = self.client.post(LOGIN, {"email": "owner@example.com", "password": "nope"})
        unknown = self.client.post(LOGIN, {"email": "ghost@example.com", "password": "nope"})
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.json(), unknown.json())

    def test_password_alone_does_not_log_in(self):
        self.make_owner()
        response = self.client.post(LOGIN, {"email": "OWNER@example.com", "password": PASSWORD})
        self.assertEqual(response.json(), {"next": "setup"})
        self.assertEqual(self.client.get(ME).status_code, 403)

    def test_user_with_app_is_sent_to_verify(self):
        self.add_device(self.make_owner())
        response = self.client.post(LOGIN, {"email": "owner@example.com", "password": PASSWORD})
        self.assertEqual(response.json(), {"next": "verify"})

    def test_removed_admin_cannot_log_in(self):
        admin = self.make_admin()
        admin.is_active = False
        admin.save()
        response = self.client.post(LOGIN, {"email": "admin@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 400)

    def test_missing_or_bad_fields_are_rejected(self):
        self.assertEqual(self.client.post(LOGIN, {}).status_code, 400)
        self.assertEqual(self.client.post(LOGIN, {"email": "x", "password": "y"}).status_code, 400)
        self.assertEqual(self.client.post(LOGIN, {"email": "a@b.co", "password": "p" * 500}).status_code, 400)

    def test_csrf_token_required(self):
        self.make_owner()
        client = SecureAPIClient(enforce_csrf_checks=True)
        self.assertEqual(client.post(LOGIN, {"email": "owner@example.com", "password": PASSWORD}).status_code, 403)
        client.get("/api/auth/csrf/")
        token = client.cookies["csrftoken"].value
        response = client.post(
            LOGIN, {"email": "owner@example.com", "password": PASSWORD},
            HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://testserver",
        )
        self.assertEqual(response.status_code, 200)
        foreign = client.post(
            LOGIN, {"email": "owner@example.com", "password": PASSWORD},
            HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://evil.example",
        )
        self.assertEqual(foreign.status_code, 403)

    def test_repeated_attempts_on_one_account_are_limited(self):
        self.make_owner()
        with mock.patch.object(LoginAccountThrottle, "rate", "2/h", create=True):
            codes = [
                self.client.post(LOGIN, {"email": "owner@example.com", "password": "wrong"}).status_code
                for _ in range(3)
            ]
        self.assertEqual(codes, [400, 400, 429])


class SetupTest(AccountsTestCase):
    def login_password(self):
        self.owner = self.make_owner()
        self.client.post(LOGIN, {"email": "owner@example.com", "password": PASSWORD})

    def test_setup_then_confirm_logs_in_and_returns_recovery_codes(self):
        self.login_password()
        setup = self.client.post(SETUP)
        self.assertEqual(setup.status_code, 200)
        self.assertIn("issuer=GenZ", setup.json()["otpauth_url"])
        device = TOTPDevice.objects.get(user=self.owner)
        response = self.client.post(CONFIRM, {"code": current_code(device)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["recovery_codes"]), 10)
        self.assertEqual(self.client.get(ME).json()["role"], "owner")

    def test_wrong_confirm_code_does_not_log_in(self):
        self.login_password()
        self.client.post(SETUP)
        self.assertEqual(self.client.post(CONFIRM, {"code": "000000"}).status_code, 400)
        self.assertEqual(self.client.get(ME).status_code, 403)
        self.assertFalse(TOTPDevice.objects.get(user=self.owner).confirmed)

    def test_setup_requires_password_step(self):
        self.assertEqual(self.client.post(SETUP).status_code, 401)
        self.assertEqual(self.client.post(CONFIRM, {"code": "123456"}).status_code, 401)

    def test_cannot_replace_an_existing_app_through_setup(self):
        self.login_password()
        self.add_device(self.owner)
        self.assertEqual(self.client.post(SETUP).status_code, 400)
        self.assertEqual(self.client.post(CONFIRM, {"code": "123456"}).status_code, 400)
        self.assertEqual(TOTPDevice.objects.filter(user=self.owner).count(), 1)


class VerifyTest(AccountsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.device = self.add_device(self.owner)
        self.client.post(LOGIN, {"email": "owner@example.com", "password": PASSWORD})

    def test_right_code_logs_in(self):
        response = self.client.post(VERIFY, {"code": current_code(self.device)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], "owner@example.com")
        self.assertEqual(self.client.get(ME).status_code, 200)

    def test_wrong_code_does_not_log_in(self):
        self.assertEqual(self.client.post(VERIFY, {"code": "000000"}).status_code, 400)
        self.assertEqual(self.client.get(ME).status_code, 403)

    def test_recovery_code_works_once(self):
        RecoveryCode.objects.create(
            user=self.owner, code_hash=hashlib.sha256(b"ABCDEFGHJKLMNPQR").hexdigest()
        )
        self.assertEqual(self.client.post(VERIFY, {"code": "abcd-efgh-jklm-npqr"}).status_code, 200)
        self.client.post(LOGOUT)
        self.client.post(LOGIN, {"email": "owner@example.com", "password": PASSWORD})
        self.assertEqual(self.client.post(VERIFY, {"code": "ABCD-EFGH-JKLM-NPQR"}).status_code, 400)

    def test_expired_password_step_is_refused(self):
        with mock.patch.object(sessions.time, "time", return_value=time.time() + 10_000):
            response = self.client.post(VERIFY, {"code": current_code(self.device)})
        self.assertEqual(response.status_code, 401)

    def test_code_guessing_is_limited(self):
        with mock.patch.object(SecondStepThrottle, "rate", "2/h", create=True):
            codes = [self.client.post(VERIFY, {"code": "000000"}).status_code for _ in range(3)]
        self.assertEqual(codes[-1], 429)

    def test_logout_ends_the_session(self):
        self.client.post(VERIFY, {"code": current_code(self.device)})
        self.assertEqual(self.client.post(LOGOUT).status_code, 204)
        self.assertEqual(self.client.get(ME).status_code, 403)
