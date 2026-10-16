import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import AdminActivity, AdminInvite
from utils.accounts import activity
from utils.accounts.roles import ADMIN


class InviteError(Exception):
    """Raised with a message that is safe to show the person accepting the invite."""


def create_invite(created_by):
    """Returns the invite and its raw token. The token is shown once and never stored."""
    token = secrets.token_urlsafe(32)
    with transaction.atomic():
        invite = AdminInvite.objects.create(
            token_hash=_hash(token),
            created_by=created_by,
            expires_at=timezone.now() + timedelta(hours=settings.ADMIN_INVITE_TTL_HOURS),
        )
        activity.record(created_by, AdminActivity.Action.INVITE_CREATED, invite=invite)
    return invite, token


def pending_invites():
    return AdminInvite.objects.filter(
        accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now()
    ).select_related("created_by").order_by("-id")


def revoke_invite(invite_id, revoked_by):
    with transaction.atomic():
        invite = pending_invites().select_for_update(of=("self",)).filter(pk=invite_id).first()
        if invite is None:
            return False
        invite.revoked_at = timezone.now()
        invite.save(update_fields=["revoked_at"])
        activity.record(revoked_by, AdminActivity.Action.INVITE_REVOKED, invite=invite)
    return True


def find_usable(token):
    if not token or len(token) > 128:
        return None
    return pending_invites().filter(token_hash=_hash(token)).first()


def accept_invite(token, email, display_name, password):
    """Create the new admin from a valid invite. Raises InviteError when it can't."""
    with transaction.atomic():
        invite = find_usable(token)
        if invite is None:
            raise InviteError("Cette invitation n'est plus valide. Demandez un nouveau lien.")
        # Lock the row so two people can't use the same link at once.
        invite = AdminInvite.objects.select_for_update().get(pk=invite.pk)
        if invite.accepted_at or invite.revoked_at:
            raise InviteError("Cette invitation n'est plus valide. Demandez un nouveau lien.")
        try:
            with transaction.atomic():
                user = get_user_model().objects.create_user(email, display_name, password)
        except IntegrityError:
            raise InviteError("Un compte existe déjà avec cette adresse e-mail.") from None
        user.groups.add(Group.objects.get(name=ADMIN))
        invite.accepted_at = timezone.now()
        invite.accepted_by = user
        invite.save(update_fields=["accepted_at", "accepted_by"])
        activity.record(user, AdminActivity.Action.ADMIN_JOINED, target_user=user, invite=invite)
    return user


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()
