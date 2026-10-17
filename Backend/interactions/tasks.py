from celery import shared_task

from utils.interactions import follows


@shared_task
def send_post_notifications(post_id, after_id=0):
    return follows.send_post_notifications(post_id, after_id)
