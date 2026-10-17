"""Anonymous visitor devices, stored only as a hash of their secret.

Browsers carry the secret in an HttpOnly cookie. The phone app keeps it in secure storage and
sends it in the X-Device-Key header.
"""

import hashlib
import secrets
from functools import wraps

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect

from interactions.models import Device

COOKIE_NAME = "device"
HEADER = "HTTP_X_DEVICE_KEY"
MAX_LENGTH = 100


class UnknownDevice(Exception):
    """The app sent a device key the server doesn't know (for example after a database reset)."""


def hash_secret(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _find(token):
    if not token or len(token) > MAX_LENGTH:
        return None
    return Device.objects.filter(token_hash=hash_secret(token)).first()


def uses_key(request):
    return HEADER in request.META


def secret(request):
    """The device secret the request carries (app header or browser cookie), possibly empty."""
    if uses_key(request):
        return request.META[HEADER]
    return request.COOKIES.get(COOKIE_NAME, "")


def current(request):
    """The visitor's device, or None if they have never interacted."""
    return _find(secret(request))


def register():
    """A new device. Returns (device, secret); only the hash is stored, so the secret is shown once."""
    token = secrets.token_urlsafe(32)
    return Device.objects.create(token_hash=hash_secret(token)), token


def current_or_new(request):
    """Returns (device, cookie_to_set). The app must register first; browsers get a cookie on first use."""
    if uses_key(request):
        device = current(request)
        if device is None:
            raise UnknownDevice
        return device, None
    device = current(request)
    if device is not None:
        return device, None
    return register()


def set_cookie(response, token):
    if token:
        response.set_cookie(
            COOKIE_NAME,
            token,
            max_age=settings.DEVICE_COOKIE_AGE_SECONDS,
            httponly=True,
            secure=settings.DEVICE_COOKIE_SECURE,
            samesite="Lax",
        )
    return response


def _csrf_unless_device_key(view):
    protected = csrf_protect(view)

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        # Other websites can't add custom headers to a request without our permission (we give none),
        # so a request carrying X-Device-Key can't be forged cross-site; cookie requests still need the token.
        if uses_key(request):
            return view(request, *args, **kwargs)
        return protected(request, *args, **kwargs)

    return wrapper


def csrf_checked_for_browsers(view_class):
    return method_decorator(_csrf_unless_device_key, name="dispatch")(view_class)
