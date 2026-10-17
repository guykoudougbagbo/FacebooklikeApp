from celery import shared_task

from utils.accounts import app_logins


@shared_task
def prune_app_logins():
    return app_logins.prune_expired()
