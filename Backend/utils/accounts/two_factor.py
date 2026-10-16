"""Second login step: authenticator-app codes (django-otp TOTP) and one-time recovery codes."""

import hashlib
import secrets
from base64 import b32encode

import django_otp
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice

from accounts.models import RecoveryCode

RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def has_confirmed_device(user):
    return TOTPDevice.objects.filter(user=user, confirmed=True).exists()


def start_setup(user):
    """Replace any half-finished setup with a fresh secret. Returns the app setup link and the secret."""
    with transaction.atomic():
        TOTPDevice.objects.filter(user=user, confirmed=False).delete()
        device = TOTPDevice.objects.create(user=user, name="authenticator", confirmed=False)
    return device.config_url, b32encode(device.bin_key).decode()


def confirm_setup(user, code):
    """Confirm the pending device with a code from the app. Returns new recovery codes, or None."""
    with transaction.atomic():
        device = TOTPDevice.objects.select_for_update().filter(user=user, confirmed=False).first()
        if device is None or not device.verify_token(_digits(code)):
            return None
        TOTPDevice.objects.filter(user=user, confirmed=True).delete()
        device.confirmed = True
        device.save(update_fields=["confirmed"])
        return _replace_recovery_codes(user)


def verify(user, code):
    """Check an app code or an unused recovery code. Recovery codes work once."""
    cleaned = _digits(code)
    if cleaned.isdigit() and len(cleaned) == 6:
        device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
        return device is not None and django_otp.verify_token(user, device.persistent_id, cleaned) is not None
    used = RecoveryCode.objects.filter(
        user=user, code_hash=_hash(normalize_recovery_code(code)), used_at__isnull=True
    ).update(used_at=timezone.now())
    return used == 1


def reset(user):
    with transaction.atomic():
        TOTPDevice.objects.filter(user=user).delete()
        RecoveryCode.objects.filter(user=user).delete()


def normalize_recovery_code(code):
    return "".join(ch for ch in code.upper() if ch.isalnum())


def _replace_recovery_codes(user):
    RecoveryCode.objects.filter(user=user).delete()
    codes = [_new_recovery_code() for _ in range(settings.RECOVERY_CODE_COUNT)]
    RecoveryCode.objects.bulk_create(
        RecoveryCode(user=user, code_hash=_hash(normalize_recovery_code(c))) for c in codes
    )
    return codes


def _new_recovery_code():
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(16))
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def _digits(code):
    return "".join(code.split())


def _hash(value):
    return hashlib.sha256(value.encode()).hexdigest()
