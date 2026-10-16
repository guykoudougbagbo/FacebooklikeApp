from accounts.models import AdminActivity


def record(actor, action, target_user=None, invite=None):
    return AdminActivity.objects.create(actor=actor, action=action, target_user=target_user, invite=invite)


def recent_activity():
    return AdminActivity.objects.select_related("actor", "target_user").order_by("-id")
