from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Post(models.Model):
    """A page post. Visitors see it as written by the page, never by the admin."""

    class Status(models.TextChoices):
        PROCESSING = "processing"
        PUBLISHED = "published"
        FAILED = "failed"

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    body = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROCESSING)
    created_at = models.DateTimeField(default=timezone.now)
    published_at = models.DateTimeField(null=True, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["-published_at", "-id"],
                condition=Q(status="published"),
                name="posts_feed_idx",
            ),
        ]
        permissions = [
            ("create_post", "Publier sur la page"),
            ("edit_own_post", "Modifier ses propres publications"),
            ("delete_own_post", "Supprimer ses propres publications"),
            ("delete_any_post", "Supprimer n'importe quelle publication"),
            ("view_post_details", "Voir l'auteur et l'état des publications"),
        ]


class PostMedia(models.Model):
    """One photo or video of a post, in display order."""

    class Kind(models.TextChoices):
        PHOTO = "photo"
        VIDEO = "video"

    class Status(models.TextChoices):
        PENDING = "pending"
        READY = "ready"
        FAILED = "failed"

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="media")
    position = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.PHOTO)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    # The upload as received, in private storage. Emptied once the web versions exist.
    original_name = models.CharField(max_length=255, blank=True)
    # Photos: feed and full-screen WebP versions.
    feed_name = models.CharField(max_length=255, blank=True)
    full_name = models.CharField(max_length=255, blank=True)
    # Videos: the MP4 to play and its cover image.
    video_name = models.CharField(max_length=255, blank=True)
    poster_name = models.CharField(max_length=255, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    # Videos: the sound mix chosen at upload, in percent, and the music file (private) until processed.
    original_volume = models.PositiveSmallIntegerField(null=True, blank=True)
    music_volume = models.PositiveSmallIntegerField(null=True, blank=True)
    music_original_name = models.CharField(max_length=255, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    queued_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "position"], name="posts_media_position_unique"),
            models.CheckConstraint(
                condition=(
                    Q(kind="photo", original_volume__isnull=True, music_volume__isnull=True)
                    | Q(kind="video", original_volume__lte=100, music_volume__lte=100)
                ),
                name="posts_media_volumes_match_kind",
            ),
        ]
        indexes = [
            models.Index(
                fields=["queued_at", "id"],
                condition=Q(status="pending"),
                name="posts_media_pending_idx",
            ),
        ]
