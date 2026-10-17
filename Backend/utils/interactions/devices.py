"""Anonymous visitor devices: a random token in an HttpOnly cookie, stored only as a hash."""

import hashlib
import secrets

from django.conf import settings

from interactions.models import Device

COOKIE_NAME = "device"


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current(request):
    """The visitor's device, or None if they have never interacted."""
    token = request.COOKIES.get(COOKIE_NAME, "")
    if not token or len(token) > 100:
        return None
    return Device.objects.filter(token_hash=_hash(token)).first()


def current_or_new(request):
    """Returns (device, token_to_set). token_to_set is None when the cookie is already valid."""
    device = current(request)
    if device is not None:
        return device, None
    token = secrets.token_urlsafe(32)
    return Device.objects.create(token_hash=_hash(token)), token


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
