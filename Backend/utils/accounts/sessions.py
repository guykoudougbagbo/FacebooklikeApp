"""Two-step login: the password step parks the user in the session; only the second step logs in."""

import time

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout

from utils.accounts import two_factor

PENDING_KEY = "pending_login"
MODEL_BACKEND = "django.contrib.auth.backends.ModelBackend"

NEXT_VERIFY = "verify"
NEXT_SETUP = "setup"


def start_password_step(request, email, password):
    """Returns the next step name, or None when the email/password pair is wrong."""
    user = authenticate(request, username=email.strip().lower(), password=password)
    if user is None:
        return None
    return begin_pending(request, user)


def begin_pending(request, user):
    request.session.cycle_key()
    request.session[PENDING_KEY] = {
        "user_id": user.pk,
        "epoch": user.session_epoch,
        "expires": time.time() + settings.LOGIN_PENDING_TTL_SECONDS,
    }
    return NEXT_VERIFY if two_factor.has_confirmed_device(user) else NEXT_SETUP


def pending_user(request):
    """The user who passed the password step in this session, if still valid."""
    pending = request.session.get(PENDING_KEY)
    if not pending or pending.get("expires", 0) < time.time():
        return None
    user = get_user_model().objects.filter(pk=pending.get("user_id"), is_active=True).first()
    if user is None or user.session_epoch != pending.get("epoch"):
        return None
    return user


def complete_login(request, user):
    request.session.pop(PENDING_KEY, None)
    login(request, user, backend=MODEL_BACKEND)


def end_session(request):
    logout(request)


def end_all_sessions(user):
    user.session_epoch += 1
    user.save(update_fields=["session_epoch"])
