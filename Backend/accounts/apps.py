from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync_roles(sender, **kwargs):
    from django.apps import apps
    from django.contrib.auth.management import create_permissions

    from utils.accounts.roles import sync_role_groups

    # Roles span several apps, whose permissions Django creates one app at a time; make them all exist first.
    for app_config in apps.get_app_configs():
        create_permissions(app_config, verbosity=0)
    sync_role_groups()


class AccountsConfig(AppConfig):
    name = 'accounts'

    def ready(self):
        # Runs after every migrate, so role permissions can't drift from the registry.
        post_migrate.connect(_sync_roles, sender=self)
