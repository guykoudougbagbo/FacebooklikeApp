from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import override_settings
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient, APITestCase

from utils.accounts.roles import ADMIN, OWNER

PASSWORD = "Tr3s-solide-mot-de-passe"

# Tests use an in-memory cache so they never touch the developer's Redis data.
LOCMEM_CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


class SecureAPIClient(APIClient):
    """Sends requests over HTTPS, as browsers do on the live site (plain HTTP is redirected there)."""

    def request(self, **request):
        request.update({"wsgi.url_scheme": "https", "SERVER_PORT": "443"})
        return super().request(**request)


# The real password hasher is slow on purpose; tests don't need that.
@override_settings(CACHES=LOCMEM_CACHE, PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AccountsTestCase(APITestCase):
    client_class = SecureAPIClient

    def setUp(self):
        from django.core.cache import cache

        cache.clear()

    def make_user(self, email, role, name=None):
        user = get_user_model().objects.create_user(email, name or email.split("@")[0], PASSWORD)
        user.groups.add(Group.objects.get(name=role))
        return user

    def make_owner(self, email="owner@example.com"):
        return self.make_user(email, OWNER, "Propriétaire")

    def make_admin(self, email="admin@example.com"):
        return self.make_user(email, ADMIN)

    def add_device(self, user):
        return TOTPDevice.objects.create(user=user, name="authenticator", confirmed=True)


def current_code(device):
    device.refresh_from_db()
    return f"{totp(device.bin_key, device.step, device.t0, device.digits, device.drift):06d}"
