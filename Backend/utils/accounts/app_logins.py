"""Admins logged in on the phone app.

The password step answers with a short-lived signed ticket instead of parking the user in a session (the app
has no cookies). The second step turns the ticket into a login key the app keeps in secure storage.
"""

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from accounts.models import AppLogin
from utils import expo_push
from utils.accounts import two_factor
from utils.accounts.sessions import NEXT_SETUP, NEXT_VERIFY

logger = logging.getLogger(__name__)

TICKET_SALT = "accounts.app_logins.ticket"
KEY_MAX_LENGTH = 100


class PushTokenError(Exception):
    """Raised with a message that is safe to show the admin."""


def _hash(key):
    return hashlib.sha256(key.encode()).hexdigest()


# --- Logging in --------------------------------------------------------------

def start(email, password):
    """Returns (next_step, ticket), or None when the email/password pair is wrong."""
    user = authenticate(None, username=email.strip().lower(), password=password)
    if user is None:
        return None
    ticket = signing.dumps({"user": user.pk, "epoch": user.session_epoch}, salt=TICKET_SALT)
    return (NEXT_VERIFY if two_factor.has_confirmed_device(user) else NEXT_SETUP), ticket


def ticket_user_id(ticket):
    """The user id a still-valid ticket was issued for, or None."""
    if not isinstance(ticket, str) or len(ticket) > 500:
        return None
    try:
        data = signing.loads(ticket, salt=TICKET_SALT, max_age=settings.LOGIN_PENDING_TTL_SECONDS)
    except signing.BadSignature:
        return None
    return data.get("user")


def pending_user(ticket):
    """The admin who passed the password step with this ticket, while it's valid and nothing changed since."""
    if not isinstance(ticket, str) or len(ticket) > 500:
        return None
    try:
        data = signing.loads(ticket, salt=TICKET_SALT, max_age=settings.LOGIN_PENDING_TTL_SECONDS)
    except signing.BadSignature:
        return None
    user = get_user_model().objects.filter(pk=data.get("user"), is_active=True).first()
    if user is None or user.session_epoch != data.get("epoch"):
        return None
    return user


def create(user):
    """Logs the admin in on this phone. Returns the key, shown once."""
    key = secrets.token_urlsafe(32)
    AppLogin.objects.create(user=user, key_hash=_hash(key), auth_hash=user.get_session_auth_hash())
    return key


# --- Using a login -------------------------------------------------------------

def _cutoff():
    return timezone.now() - timedelta(seconds=settings.APP_LOGIN_IDLE_SECONDS)


def _valid(login):
    return (login.user.is_active and login.last_used_at >= _cutoff()
            and constant_time_compare(login.auth_hash, login.user.get_session_auth_hash()))


def find(key):
    """The login this key belongs to, if it's still valid. Using it keeps it alive (see APP_LOGIN_IDLE_SECONDS)."""
    if not isinstance(key, str) or not key or len(key) > KEY_MAX_LENGTH:
        return None
    login = AppLogin.objects.select_related("user").filter(key_hash=_hash(key)).first()
    if login is None or not _valid(login):
        return None
    now = timezone.now()
    if login.last_used_at < now - timedelta(seconds=settings.APP_LOGIN_TOUCH_SECONDS):
        AppLogin.objects.filter(pk=login.pk).update(last_used_at=now)
        login.last_used_at = now
    return login


def still_valid(login_id):
    login = AppLogin.objects.select_related("user").filter(pk=login_id).first()
    return login is not None and _valid(login)


def end(login):
    AppLogin.objects.filter(pk=login.pk).delete()


def set_push_token(login, token):
    if not expo_push.is_token(token):
        raise PushTokenError("Ce téléphone n'est pas pris en charge pour les notifications.")
    with transaction.atomic():
        # A phone's token belongs to whoever logged in on it last.
        AppLogin.objects.filter(push_token=token).exclude(pk=login.pk).update(push_token=None)
        AppLogin.objects.filter(pk=login.pk).update(push_token=token)


def clear_push_token(login):
    AppLogin.objects.filter(pk=login.pk).update(push_token=None)


def notifiable(user_ids):
    """Valid logins of these admins that have a phone to notify."""
    logins = AppLogin.objects.select_related("user").filter(
        user_id__in=user_ids, push_token__isnull=False, last_used_at__gte=_cutoff()
    )
    return [login for login in logins if _valid(login)]


def forget_push_tokens(login_ids):
    logger.warning(
        "Admin push prune %s: phones reported gone %s",
        "applying" if settings.PUSH_PRUNE_APPLY else "log-only, nothing deleted", login_ids,
    )
    if settings.PUSH_PRUNE_APPLY:
        AppLogin.objects.filter(pk__in=login_ids).update(push_token=None)


# --- Scheduled clean-up ----------------------------------------------------------

def prune_expired():
    """Deletes logins unused for APP_LOGIN_IDLE_SECONDS or belonging to removed admins (log-only until switched on)."""
    stale = list(
        AppLogin.objects.filter(last_used_at__lt=_cutoff()).values_list("pk", flat=True)
    ) + list(AppLogin.objects.filter(user__is_active=False).values_list("pk", flat=True))
    stale = sorted(set(stale))
    if stale:
        logger.warning(
            "App login prune %s: %s",
            "applying" if settings.APP_LOGIN_PRUNE_APPLY else "log-only, nothing deleted", stale,
        )
        if settings.APP_LOGIN_PRUNE_APPLY:
            AppLogin.objects.filter(pk__in=stale).delete()
    return {"stale": len(stale), "deleted": len(stale) if settings.APP_LOGIN_PRUNE_APPLY else 0}
