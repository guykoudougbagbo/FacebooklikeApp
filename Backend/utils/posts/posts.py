import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max, Prefetch
from django.utils import timezone

from posts.models import Post, PostPhoto
from utils.posts import photos

logger = logging.getLogger(__name__)


class PostError(Exception):
    """Raised with a message that is safe to show the admin."""


class PostNotFound(Exception):
    pass


# --- Reading ---------------------------------------------------------------

def public_feed():
    ready = PostPhoto.objects.filter(status=PostPhoto.Status.READY).order_by("position")
    return Post.objects.filter(status=Post.Status.PUBLISHED).prefetch_related(
        Prefetch("photos", queryset=ready, to_attr="visible_photos")
    )


def admin_feed():
    every_photo = PostPhoto.objects.order_by("position")
    return Post.objects.select_related("author").prefetch_related(
        Prefetch("photos", queryset=every_photo, to_attr="visible_photos")
    )


def can_edit(user, post):
    return post.author_id == user.pk and user.has_perm("posts.edit_own_post")


def can_delete(user, post):
    return user.has_perm("posts.delete_any_post") or (
        post.author_id == user.pk and user.has_perm("posts.delete_own_post")
    )


# --- Writing ---------------------------------------------------------------

def create_post(author, body, uploads):
    body = clean_body(body)
    _check_counts(body, photo_count=len(uploads))
    extensions = [photos.check_upload(upload) for upload in uploads]
    originals = _save_originals(uploads, extensions)
    try:
        with transaction.atomic():
            post = Post.objects.create(
                author=author,
                body=body,
                status=Post.Status.PROCESSING if uploads else Post.Status.PUBLISHED,
                published_at=None if uploads else timezone.now(),
            )
            _add_photos(post, originals, first_position=0)
    except Exception:
        photos.delete_files(private_names=originals)
        raise
    if originals:
        _enqueue_processing(post.id)
    return post


def edit_post(post_id, user, body, uploads, remove_photo_ids):
    body = clean_body(body)
    extensions = [photos.check_upload(upload) for upload in uploads]
    originals = _save_originals(uploads, extensions)
    try:
        with transaction.atomic():
            post = Post.objects.select_for_update().filter(pk=post_id).first()
            if post is None:
                raise PostNotFound
            if not can_edit(user, post):
                raise PermissionError
            removed = list(post.photos.filter(id__in=remove_photo_ids))
            kept = post.photos.exclude(id__in=[p.id for p in removed]).count()
            _check_counts(body, photo_count=kept + len(originals))
            next_position = (post.photos.aggregate(top=Max("position"))["top"] or 0) + 1
            post.photos.filter(id__in=[p.id for p in removed]).delete()
            post.body = body
            post.edited_at = timezone.now()
            post.save(update_fields=["body", "edited_at"])
            _add_photos(post, originals, first_position=next_position)
            transaction.on_commit(lambda: _delete_photo_files(removed))
    except Exception:
        photos.delete_files(private_names=originals)
        raise
    if originals:
        _enqueue_processing(post.id)
    return post


def delete_post(post_id, user):
    with transaction.atomic():
        post = Post.objects.select_for_update().filter(pk=post_id).first()
        if post is None:
            raise PostNotFound
        if not can_delete(user, post):
            raise PermissionError
        removed = list(post.photos.all())
        post.delete()
        transaction.on_commit(lambda: _delete_photo_files(removed))


def clean_body(body):
    if not isinstance(body, str):
        body = ""
    body = body.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    if len(body) > settings.POST_MAX_TEXT_LENGTH:
        raise PostError(f"Le texte dépasse {settings.POST_MAX_TEXT_LENGTH} caractères.")
    return body


def _check_counts(body, photo_count):
    if photo_count > settings.POST_MAX_PHOTOS:
        raise PostError(f"Une publication peut contenir au maximum {settings.POST_MAX_PHOTOS} photos.")
    if not body and photo_count == 0:
        raise PostError("Écrivez un texte ou ajoutez au moins une photo.")


def _save_originals(uploads, extensions):
    saved = []
    try:
        for upload, extension in zip(uploads, extensions):
            saved.append(photos.save_original(upload, extension))
    except Exception:
        photos.delete_files(private_names=saved)
        raise
    return saved


def _add_photos(post, originals, first_position):
    PostPhoto.objects.bulk_create(
        PostPhoto(post=post, position=first_position + i, original_name=name)
        for i, name in enumerate(originals)
    )


def _delete_photo_files(photo_rows):
    photos.delete_files(
        public_names=[n for p in photo_rows for n in (p.feed_name, p.full_name)],
        private_names=[p.original_name for p in photo_rows],
    )


def _enqueue_processing(post_id):
    from posts.tasks import process_post_photos

    # Only after commit, so the worker never looks for rows that aren't saved yet.
    transaction.on_commit(lambda: process_post_photos.delay(post_id))


# --- Background processing -----------------------------------------------

def process_post_photos(post_id):
    # Same order as the repair job, so the two never wait on each other's locks.
    for photo_id in PostPhoto.objects.filter(post_id=post_id, status=PostPhoto.Status.PENDING).order_by("id").values_list("id", flat=True):
        process_photo(photo_id)
    finish_post(post_id)


def process_photo(photo_id):
    with transaction.atomic():
        photo = (
            PostPhoto.objects.select_for_update(skip_locked=True)
            .filter(pk=photo_id, status=PostPhoto.Status.PENDING).first()
        )
        if photo is None:
            return
        photo.attempts += 1
        photo.save(update_fields=["attempts"])

    try:
        feed_name, full_name, width, height = photos.render_web_versions(photo.original_name)
    except photos.PhotoError:
        _mark_failed(photo.id)
        return

    with transaction.atomic():
        current = PostPhoto.objects.select_for_update().filter(pk=photo.id, status=PostPhoto.Status.PENDING).first()
        if current is None:
            # Removed, or finished elsewhere, while we worked: our files aren't needed.
            photos.delete_files(public_names=[feed_name, full_name])
            return
        original = current.original_name
        current.status = PostPhoto.Status.READY
        current.feed_name, current.full_name = feed_name, full_name
        current.width, current.height = width, height
        current.original_name = ""
        current.save(update_fields=["status", "feed_name", "full_name", "width", "height", "original_name"])
        transaction.on_commit(lambda: photos.delete_files(private_names=[original]))


def finish_post(post_id):
    with transaction.atomic():
        post = Post.objects.select_for_update().filter(pk=post_id, status=Post.Status.PROCESSING).first()
        if post is None or post.photos.filter(status=PostPhoto.Status.PENDING).exists():
            return
        if post.body or post.photos.filter(status=PostPhoto.Status.READY).exists():
            post.status, post.published_at = Post.Status.PUBLISHED, timezone.now()
        else:
            post.status = Post.Status.FAILED
        post.save(update_fields=["status", "published_at"])


def _mark_failed(photo_id):
    with transaction.atomic():
        photo = PostPhoto.objects.select_for_update().filter(pk=photo_id, status=PostPhoto.Status.PENDING).first()
        if photo is None:
            return
        original = photo.original_name
        photo.status, photo.original_name = PostPhoto.Status.FAILED, ""
        photo.save(update_fields=["status", "original_name"])
        transaction.on_commit(lambda: photos.delete_files(private_names=[original]))


# --- Repair job -----------------------------------------------------------

def repair_stuck_photos():
    """Retry photos whose processing never finished; give up on them after the maximum attempts.

    While POST_REPAIR_APPLY is false it only logs what it would do.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.POST_PROCESSING_TIMEOUT_SECONDS)
    stuck = list(
        PostPhoto.objects.filter(status=PostPhoto.Status.PENDING, queued_at__lt=cutoff)
        .order_by("id").values("id", "post_id", "attempts")[: settings.POST_REPAIR_BATCH_SIZE]
    )
    give_up = [row for row in stuck if row["attempts"] >= settings.POST_PROCESSING_MAX_ATTEMPTS]
    retry = [row for row in stuck if row["attempts"] < settings.POST_PROCESSING_MAX_ATTEMPTS]
    if not stuck:
        return {"retried": 0, "failed": 0, "applied": settings.POST_REPAIR_APPLY}

    logger.warning(
        "Photo repair %s: retry photos %s; mark failed and delete originals of photos %s",
        "applying" if settings.POST_REPAIR_APPLY else "log-only, nothing changed",
        [row["id"] for row in retry], [row["id"] for row in give_up],
    )
    if not settings.POST_REPAIR_APPLY:
        return {"retried": 0, "failed": 0, "applied": False}

    for row in give_up:
        _mark_failed(row["id"])
    PostPhoto.objects.filter(id__in=[row["id"] for row in retry]).update(queued_at=timezone.now())
    retry_posts = {row["post_id"] for row in retry}
    for post_id in sorted({row["post_id"] for row in stuck}):
        if post_id in retry_posts:
            _enqueue_processing(post_id)
        else:
            finish_post(post_id)
    return {"retried": len(retry), "failed": len(give_up), "applied": True}
