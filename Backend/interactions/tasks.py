from celery import shared_task

from utils import expo_push
from utils.interactions import follows


@shared_task
def send_post_notifications(post_id, after_id=0):
    return follows.send_post_notifications(post_id, after_id)


@shared_task(bind=True)
def send_app_notifications(self, post_id, after_id=0):
    return expo_push.retry_when_busy(self, follows.send_app_notifications, post_id, after_id)


@shared_task(bind=True)
def check_app_receipts(self, receipts):
    return expo_push.retry_when_busy(self, follows.check_app_receipts, receipts)
