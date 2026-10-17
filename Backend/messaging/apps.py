from django.apps import AppConfig


def _leave_groups(sender, removed_user, acting_user, **kwargs):
    from utils.messaging.conversations import remove_from_all_groups

    remove_from_all_groups(removed_user, acting_user)


class MessagingConfig(AppConfig):
    name = 'messaging'

    def ready(self):
        from utils.accounts.signals import admin_removed

        admin_removed.connect(_leave_groups, dispatch_uid="messaging.leave_groups")
