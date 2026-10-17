from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync_roles(sender, **kwargs):
    from django.apps import apps

    from utils.accounts.roles import sync_role_groups

    # Django renames and creates permissions one app at a time; roles span apps, so wait for the
    # last app it handles. Creating them earlier ourselves clashes with Django's renames.
    with_models = [config for config in apps.get_app_configs() if config.models_module is not None]
    if sender is with_models[-1]:
        sync_role_groups()


class AccountsConfig(AppConfig):
    name = 'accounts'

    def ready(self):
        # Runs after every migrate, so role permissions can't drift from the registry.
        post_migrate.connect(_sync_roles, dispatch_uid="accounts.sync_roles")
