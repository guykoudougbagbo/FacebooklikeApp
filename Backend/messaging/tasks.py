from celery import shared_task

from utils import expo_push
from utils.messaging import notifications


@shared_task(bind=True)
def send_message_notifications(self, message_id):
    return expo_push.retry_when_busy(self, notifications.send, message_id)


@shared_task(bind=True)
def check_message_receipts(self, receipts):
    return expo_push.retry_when_busy(self, notifications.check_receipts, receipts)
