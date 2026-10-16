from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync_roles(sender, **kwargs):
    from utils.accounts.roles import sync_role_groups

    sync_role_groups()


class AccountsConfig(AppConfig):
    name = 'accounts'

    def ready(self):
        # Runs after every migrate, so role permissions can't drift from the registry.
        post_migrate.connect(_sync_roles, sender=self)
