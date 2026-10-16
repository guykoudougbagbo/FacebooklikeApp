from celery import shared_task

from utils.posts import posts


@shared_task
def process_post_photos(post_id):
    posts.process_post_photos(post_id)


@shared_task
def repair_stuck_photos():
    return posts.repair_stuck_photos()
