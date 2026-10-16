import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import AdminActivity, AdminInvite
from utils.accounts import activity, sessions, two_factor
from utils.accounts.roles import ADMIN, OWNER

INVALID = "Cette invitation n'est plus valide. Demandez un nouveau lien."


class InviteError(Exception):
    """Raised with a message that is safe to show the person using the link."""


def create_invite(created_by):
    """Returns the invite and its raw token. The token is shown once and never stored."""
    with transaction.atomic():
        invite, token = _new_invite(created_by)
        activity.record(created_by, AdminActivity.Action.INVITE_CREATED, invite=invite)
    return invite, token


def create_reinvite(former_admin_id, created_by):
    """A link that can only switch this one removed admin back on. Replaces any earlier pending one."""
    with transaction.atomic():
        target = (
            get_user_model().objects.select_for_update(of=("self",))
            .filter(pk=former_admin_id, is_active=False, groups__name=ADMIN)
            .exclude(groups__name=OWNER).first()
        )
        if target is None:
            raise InviteError("Ancien administrateur introuvable.")
        pending_invites().filter(for_user=target).update(revoked_at=timezone.now())
        invite, token = _new_invite(created_by, for_user=target)
        activity.record(created_by, AdminActivity.Action.ADMIN_REINVITED, target_user=target, invite=invite)
    return invite, token


def pending_invites():
    return AdminInvite.objects.filter(
        accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now()
    ).select_related("created_by", "for_user").order_by("-id")


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
    """Create a new admin from a new-admin link. Raises InviteError when it can't."""
    with transaction.atomic():
        invite = _lock_usable(token)
        if invite.for_user_id is not None:
            raise InviteError(INVALID)
        email = email.strip().lower()
        existing = get_user_model().objects.filter(email__iexact=email).first()
        if existing is not None and not existing.is_active:
            # A removed admin can only come back through their own re-invite link.
            raise InviteError("Cette adresse appartient à un ancien administrateur. Demandez au propriétaire de vous réinviter.")
        try:
            with transaction.atomic():
                user = get_user_model().objects.create_user(email, display_name, password)
        except IntegrityError:
            raise InviteError("Un compte existe déjà avec cette adresse e-mail.") from None
        user.groups.add(Group.objects.get(name=ADMIN))
        _mark_accepted(invite, user)
        activity.record(user, AdminActivity.Action.ADMIN_JOINED, target_user=user, invite=invite)
    return user


def reactivate_from_invite(token, password):
    """Switch a removed admin back on from their re-invite link, with a new password and no old second step."""
    with transaction.atomic():
        invite = _lock_usable(token)
        if invite.for_user_id is None:
            raise InviteError(INVALID)
        user = get_user_model().objects.select_for_update().get(pk=invite.for_user_id)
        if user.is_active:
            raise InviteError(INVALID)
        try:
            password_validation.validate_password(password, user)
        except ValidationError as exc:
            raise InviteError(" ".join(exc.messages)) from None
        user.set_password(password)
        user.is_active = True
        user.save(update_fields=["password", "is_active"])
        # Whatever they used before (phone, backup codes, sessions) must not work again.
        two_factor.reset(user)
        sessions.end_all_sessions(user)
        _mark_accepted(invite, user)
        activity.record(user, AdminActivity.Action.ADMIN_REJOINED, target_user=user, invite=invite)
    return user


def _new_invite(created_by, for_user=None):
    token = secrets.token_urlsafe(32)
    invite = AdminInvite.objects.create(
        token_hash=_hash(token),
        created_by=created_by,
        for_user=for_user,
        expires_at=timezone.now() + timedelta(hours=settings.ADMIN_INVITE_TTL_HOURS),
    )
    return invite, token


def _lock_usable(token):
    invite = find_usable(token)
    if invite is None:
        raise InviteError(INVALID)
    # Lock the row so two people can't use the same link at once.
    invite = AdminInvite.objects.select_for_update().get(pk=invite.pk)
    if invite.accepted_at or invite.revoked_at:
        raise InviteError(INVALID)
    return invite


def _mark_accepted(invite, user):
    invite.accepted_at = timezone.now()
    invite.accepted_by = user
    invite.save(update_fields=["accepted_at", "accepted_by"])


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()
