"""Delivers events to admins' open live connections, through each admin's personal channel group."""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction

from utils.accounts import app_logins


def group_name(user_id):
    return f"user.{user_id}"


def notify(user_ids, event):
    """Sends `event` to these admins once the current database changes are saved."""
    user_ids = sorted(set(user_ids))

    def send():
        layer = get_channel_layer()
        for user_id in user_ids:
            async_to_sync(layer.group_send)(group_name(user_id), {"type": "deliver", "event": event})

    transaction.on_commit(send)


def can_connect(user):
    return bool(user and user.is_authenticated and user.is_active and user.has_perm("messaging.use_messaging"))


def still_allowed(user_id, session_epoch, app_login_id=None):
    """An open connection keeps receiving only while its admin is active and wasn't logged out everywhere,
    and, for the phone app, while that phone's login lasts."""
    if app_login_id is not None and not app_logins.still_valid(app_login_id):
        return False
    return get_user_model().objects.filter(pk=user_id, is_active=True, session_epoch=session_epoch).exists()
