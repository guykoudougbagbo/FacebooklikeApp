import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max, Prefetch
from django.utils import timezone

from posts.models import Post, PostMedia
from utils.posts import photos, videos

logger = logging.getLogger(__name__)

PROCESSING_ERRORS = (photos.PhotoError, videos.VideoError)


class PostError(Exception):
    """Raised with a message that is safe to show the admin."""


class PostNotFound(Exception):
    pass


# --- Reading ---------------------------------------------------------------

def public_feed():
    ready = PostMedia.objects.filter(status=PostMedia.Status.READY).order_by("position")
    return Post.objects.filter(status=Post.Status.PUBLISHED).prefetch_related(
        Prefetch("media", queryset=ready, to_attr="visible_media")
    )


def admin_feed():
    every_item = PostMedia.objects.order_by("position")
    return Post.objects.select_related("author").prefetch_related(
        Prefetch("media", queryset=every_item, to_attr="visible_media")
    )


def can_edit(user, post):
    return post.author_id == user.pk and user.has_perm("posts.edit_own_post")


def can_delete(user, post):
    return user.has_perm("posts.delete_any_post") or (
        post.author_id == user.pk and user.has_perm("posts.delete_own_post")
    )


# --- Writing ---------------------------------------------------------------

def create_post(author, body, items):
    """`items` come from utils.posts.uploads.parse, already checked."""
    body = clean_body(body)
    _check_counts(body, item_count=len(items))
    saved = _save_originals(items)
    try:
        with transaction.atomic():
            post = Post.objects.create(
                author=author,
                body=body,
                status=Post.Status.PROCESSING if items else Post.Status.PUBLISHED,
                published_at=None if items else timezone.now(),
            )
            _add_media(post, saved, first_position=0)
    except Exception:
        _delete_saved(saved)
        raise
    if saved:
        _enqueue_processing(post.id)
    return post


def edit_post(post_id, user, body, items, remove_media_ids):
    body = clean_body(body)
    saved = _save_originals(items)
    try:
        with transaction.atomic():
            post = Post.objects.select_for_update().filter(pk=post_id).first()
            if post is None:
                raise PostNotFound
            if not can_edit(user, post):
                raise PermissionError
            removed = list(post.media.filter(id__in=remove_media_ids))
            kept = post.media.exclude(id__in=[m.id for m in removed]).count()
            _check_counts(body, item_count=kept + len(saved))
            next_position = (post.media.aggregate(top=Max("position"))["top"] or 0) + 1
            post.media.filter(id__in=[m.id for m in removed]).delete()
            post.body = body
            post.edited_at = timezone.now()
            post.save(update_fields=["body", "edited_at"])
            _add_media(post, saved, first_position=next_position)
            transaction.on_commit(lambda: _delete_media_files(removed))
    except Exception:
        _delete_saved(saved)
        raise
    if saved:
        _enqueue_processing(post.id)
    return post


def delete_post(post_id, user):
    with transaction.atomic():
        post = Post.objects.select_for_update().filter(pk=post_id).first()
        if post is None:
            raise PostNotFound
        if not can_delete(user, post):
            raise PermissionError
        removed = list(post.media.all())
        post.delete()
        transaction.on_commit(lambda: _delete_media_files(removed))


def clean_body(body):
    if not isinstance(body, str):
        body = ""
    body = body.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    if len(body) > settings.POST_MAX_TEXT_LENGTH:
        raise PostError(f"Le texte dépasse {settings.POST_MAX_TEXT_LENGTH} caractères.")
    return body


def _check_counts(body, item_count):
    if item_count > settings.POST_MAX_MEDIA:
        raise PostError(f"Une publication peut contenir au maximum {settings.POST_MAX_MEDIA} photos et vidéos.")
    if not body and item_count == 0:
        raise PostError("Écrivez un texte ou ajoutez au moins une photo ou une vidéo.")


def _save_originals(items):
    """Store each upload (and its music) privately. Returns rows ready for _add_media."""
    saved = []
    try:
        for item in items:
            row = {
                "kind": item.kind,
                "original_name": photos.private_storage().save(f"posts/{_new_name()}.{item.extension}", item.upload),
                "music_original_name": "",
                "original_volume": item.original_volume,
                "music_volume": item.music_volume,
            }
            saved.append(row)
            if item.music is not None:
                row["music_original_name"] = photos.private_storage().save(
                    f"posts/music/{_new_name()}.{item.music_extension}", item.music
                )
    except Exception:
        _delete_saved(saved)
        raise
    return saved


def _new_name():
    return uuid.uuid4().hex


def _delete_saved(saved):
    photos.delete_files(private_names=[n for row in saved for n in (row["original_name"], row["music_original_name"])])


def _add_media(post, saved, first_position):
    PostMedia.objects.bulk_create(
        PostMedia(post=post, position=first_position + i, **row) for i, row in enumerate(saved)
    )


def _delete_media_files(rows):
    photos.delete_files(
        public_names=[n for m in rows for n in (m.feed_name, m.full_name, m.video_name, m.poster_name)],
        private_names=[n for m in rows for n in (m.original_name, m.music_original_name)],
    )


def _enqueue_processing(post_id):
    from posts.tasks import process_post_media

    # Only after commit, so the worker never looks for rows that aren't saved yet.
    transaction.on_commit(lambda: process_post_media.delay(post_id))


# --- Background processing -----------------------------------------------

def process_post_media(post_id):
    # Same order as the repair job, so the two never wait on each other's locks.
    pending = PostMedia.objects.filter(post_id=post_id, status=PostMedia.Status.PENDING).order_by("id")
    for media_id in pending.values_list("id", flat=True):
        process_media_item(media_id)
    finish_post(post_id)


def process_media_item(media_id):
    with transaction.atomic():
        item = (
            PostMedia.objects.select_for_update(skip_locked=True)
            .filter(pk=media_id, status=PostMedia.Status.PENDING).first()
        )
        if item is None:
            return
        item.attempts += 1
        item.save(update_fields=["attempts"])

    try:
        if item.kind == PostMedia.Kind.VIDEO:
            video_name, poster_name, width, height, duration = videos.render_video(
                item.original_name, item.music_original_name, item.original_volume, item.music_volume
            )
            result = {"video_name": video_name, "poster_name": poster_name, "duration_seconds": duration}
        else:
            feed_name, full_name, width, height = photos.render_web_versions(item.original_name)
            result = {"feed_name": feed_name, "full_name": full_name}
    except PROCESSING_ERRORS:
        _mark_failed(item.id)
        return
    result.update(width=width, height=height)
    new_files = [name for key, name in result.items() if key.endswith("_name")]

    with transaction.atomic():
        current = PostMedia.objects.select_for_update().filter(pk=item.id, status=PostMedia.Status.PENDING).first()
        if current is None:
            # Removed, or finished elsewhere, while we worked: our files aren't needed.
            photos.delete_files(public_names=new_files)
            return
        originals = [current.original_name, current.music_original_name]
        for field, value in result.items():
            setattr(current, field, value)
        current.status = PostMedia.Status.READY
        current.original_name = current.music_original_name = ""
        current.save(update_fields=[*result, "status", "original_name", "music_original_name"])
        transaction.on_commit(lambda: photos.delete_files(private_names=originals))


def finish_post(post_id):
    with transaction.atomic():
        post = Post.objects.select_for_update().filter(pk=post_id, status=Post.Status.PROCESSING).first()
        if post is None or post.media.filter(status=PostMedia.Status.PENDING).exists():
            return
        if post.body or post.media.filter(status=PostMedia.Status.READY).exists():
            post.status, post.published_at = Post.Status.PUBLISHED, timezone.now()
        else:
            post.status = Post.Status.FAILED
        post.save(update_fields=["status", "published_at"])


def _mark_failed(media_id):
    with transaction.atomic():
        item = PostMedia.objects.select_for_update().filter(pk=media_id, status=PostMedia.Status.PENDING).first()
        if item is None:
            return
        originals = [item.original_name, item.music_original_name]
        item.status, item.original_name, item.music_original_name = PostMedia.Status.FAILED, "", ""
        item.save(update_fields=["status", "original_name", "music_original_name"])
        transaction.on_commit(lambda: photos.delete_files(private_names=originals))


# --- Repair job -----------------------------------------------------------

def repair_stuck_media():
    """Retry photos and videos whose processing never finished; give up after the maximum attempts.

    While POST_REPAIR_APPLY is false it only logs what it would do.
    """
    cutoff = timezone.now() - timedelta(seconds=settings.POST_PROCESSING_TIMEOUT_SECONDS)
    stuck = list(
        PostMedia.objects.filter(status=PostMedia.Status.PENDING, queued_at__lt=cutoff)
        .order_by("id").values("id", "post_id", "attempts")[: settings.POST_REPAIR_BATCH_SIZE]
    )
    give_up = [row for row in stuck if row["attempts"] >= settings.POST_PROCESSING_MAX_ATTEMPTS]
    retry = [row for row in stuck if row["attempts"] < settings.POST_PROCESSING_MAX_ATTEMPTS]
    if not stuck:
        return {"retried": 0, "failed": 0, "applied": settings.POST_REPAIR_APPLY}

    logger.warning(
        "Media repair %s: retry media %s; mark failed and delete originals of media %s",
        "applying" if settings.POST_REPAIR_APPLY else "log-only, nothing changed",
        [row["id"] for row in retry], [row["id"] for row in give_up],
    )
    if not settings.POST_REPAIR_APPLY:
        return {"retried": 0, "failed": 0, "applied": False}

    for row in give_up:
        _mark_failed(row["id"])
    PostMedia.objects.filter(id__in=[row["id"] for row in retry]).update(queued_at=timezone.now())
    retry_posts = {row["post_id"] for row in retry}
    for post_id in sorted({row["post_id"] for row in stuck}):
        if post_id in retry_posts:
            _enqueue_processing(post_id)
        else:
            finish_post(post_id)
    return {"retried": len(retry), "failed": len(give_up), "applied": True}
