"""Central registry of roles and the permissions each one grants, as "app_label.codename"."""

from django.contrib.auth.models import Group, Permission
from django.db.models import Q

OWNER = "owner"
ADMIN = "admin"

ADMIN_PERMISSIONS = [
    "accounts.view_admins",
    "accounts.view_admin_activity",
    "posts.create_post",
    "posts.edit_own_post",
    "posts.delete_own_post",
    "posts.view_post_details",
]

OWNER_ONLY_PERMISSIONS = [
    "accounts.invite_admin",
    "accounts.remove_admin",
    "accounts.reset_admin_two_factor",
    "accounts.reinvite_admin",
    "posts.delete_any_post",
]

ROLE_PERMISSIONS = {
    # The owner is also an admin: every admin permission, present and future, plus managing the team.
    OWNER: ADMIN_PERMISSIONS + OWNER_ONLY_PERMISSIONS,
    ADMIN: ADMIN_PERMISSIONS,
}


def sync_role_groups():
    """Make each role's group hold exactly the registry's permissions."""
    for role, names in ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role)
        wanted = {tuple(name.split(".", 1)) for name in names}
        match = Q()
        for app_label, codename in wanted:
            match |= Q(content_type__app_label=app_label, codename=codename)
        permissions = list(Permission.objects.filter(match).select_related("content_type"))
        missing = wanted - {(p.content_type.app_label, p.codename) for p in permissions}
        if missing:
            raise RuntimeError(f"Permissions missing from the database: {sorted(missing)}")
        group.permissions.set(permissions)


def role_of(user):
    # .all() reuses prefetch_related("groups") results, so lists don't query once per user.
    names = {group.name for group in user.groups.all()}
    if OWNER in names:
        return OWNER
    if ADMIN in names:
        return ADMIN
    return None


def owner_exists():
    return Group.objects.filter(name=OWNER, user__is_active=True).exists()
