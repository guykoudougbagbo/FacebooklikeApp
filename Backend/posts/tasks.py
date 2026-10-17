from celery import shared_task

from utils.posts import posts


@shared_task
def process_post_media(post_id):
    posts.process_post_media(post_id)


@shared_task
def repair_stuck_media():
    return posts.repair_stuck_media()
