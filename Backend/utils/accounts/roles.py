"""Central registry of roles and the permissions each one grants (product: accounts)."""

from django.contrib.auth.models import Group, Permission

OWNER = "owner"
ADMIN = "admin"

ADMIN_PERMISSIONS = [
    "view_admins",
    "view_admin_activity",
]

OWNER_ONLY_PERMISSIONS = [
    "invite_admin",
    "remove_admin",
    "reset_admin_two_factor",
    "reinvite_admin",
]

ROLE_PERMISSIONS = {
    # The owner is also an admin: every admin permission, present and future, plus managing the team.
    OWNER: ADMIN_PERMISSIONS + OWNER_ONLY_PERMISSIONS,
    ADMIN: ADMIN_PERMISSIONS,
}


def sync_role_groups():
    """Make each role's group hold exactly the registry's permissions."""
    for role, codenames in ROLE_PERMISSIONS.items():
        group, _ = Group.objects.get_or_create(name=role)
        permissions = list(Permission.objects.filter(content_type__app_label="accounts", codename__in=codenames))
        missing = set(codenames) - {p.codename for p in permissions}
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
