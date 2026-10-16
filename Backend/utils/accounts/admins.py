from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction

from accounts.models import AdminActivity
from utils.accounts import activity, sessions, two_factor
from utils.accounts.roles import ADMIN, OWNER, owner_exists


class AdminError(Exception):
    """Raised with a message that is safe to show the person making the request."""


def active_admins():
    return (
        get_user_model().objects.filter(is_active=True, groups__isnull=False)
        .distinct().prefetch_related("groups").order_by("id")
    )


def former_admins():
    """Removed admins the owner can re-invite. The owner can't be removed, so never appears here."""
    return get_user_model().objects.filter(is_active=False, groups__name=ADMIN).distinct().order_by("id")


def create_owner(email, display_name, password):
    with transaction.atomic():
        if owner_exists():
            raise AdminError("An owner already exists.")
        user = get_user_model().objects.create_user(email, display_name, password)
        user.groups.add(Group.objects.get(name=OWNER))
    return user


def remove_admin(target_id, acting_user):
    with transaction.atomic():
        target = _lock_target(target_id, acting_user)
        target.is_active = False
        target.save(update_fields=["is_active"])
        sessions.end_all_sessions(target)
        activity.record(acting_user, AdminActivity.Action.ADMIN_REMOVED, target_user=target)


def reset_two_factor(target_id, acting_user):
    with transaction.atomic():
        target = _lock_target(target_id, acting_user)
        two_factor.reset(target)
        sessions.end_all_sessions(target)
        activity.record(acting_user, AdminActivity.Action.TWO_FACTOR_RESET, target_user=target)


def _lock_target(target_id, acting_user):
    target = get_user_model().objects.select_for_update().filter(pk=target_id, is_active=True).first()
    if target is None or not target.groups.exists():
        raise AdminError("Administrateur introuvable.")
    if target.pk == acting_user.pk:
        raise AdminError("Vous ne pouvez pas faire cette action sur votre propre compte.")
    if target.groups.filter(name=OWNER).exists():
        raise AdminError("Le propriétaire de la page ne peut pas être modifié.")
    return target
