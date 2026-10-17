from celery import shared_task
from django.conf import settings

from utils.interactions import follows


@shared_task
def send_post_notifications(post_id, after_id=0):
    return follows.send_post_notifications(post_id, after_id)


def _retry_when_busy(task, send, *args):
    try:
        return send(*args)
    except follows.PushServiceBusy as exc:
        # Expo asks for exponential backoff when it is busy.
        countdown = settings.EXPO_RETRY_BASE_SECONDS * 2 ** task.request.retries
        raise task.retry(exc=exc, countdown=countdown, max_retries=settings.EXPO_PUSH_MAX_RETRIES) from exc


@shared_task(bind=True)
def send_app_notifications(self, post_id, after_id=0):
    return _retry_when_busy(self, follows.send_app_notifications, post_id, after_id)


@shared_task(bind=True)
def check_app_receipts(self, receipts):
    return _retry_when_busy(self, follows.check_app_receipts, receipts)
