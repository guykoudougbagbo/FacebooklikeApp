from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from posts.models import Post


class Device(models.Model):
    """An anonymous visitor's browser. Only a SHA-256 of its cookie value is stored."""

    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(default=timezone.now)


class Reaction(models.Model):
    class Kind(models.TextChoices):
        LIKE = "like"
        LOVE = "love"
        HAHA = "haha"
        WOW = "wow"
        SAD = "sad"
        ANGRY = "angry"

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="+")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "device"], name="interactions_one_reaction_per_device"),
        ]
        indexes = [models.Index(fields=["post", "kind"], name="interactions_reaction_kind_idx")]


class Comment(models.Model):
    """Written either by a visitor (device + name) or by an admin replying as the page."""

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="+")
    device = models.ForeignKey(Device, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    display_name = models.CharField(max_length=60, blank=True)
    page_author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(page_author__isnull=True, display_name__gt="") | Q(page_author__isnull=False, display_name=""),
                name="interactions_comment_has_one_author",
            ),
        ]
        indexes = [models.Index(fields=["post", "id"], name="interactions_comment_post_idx")]
        permissions = [
            ("delete_any_comment", "Supprimer un commentaire"),
            ("reply_as_page", "Répondre au nom de la page"),
            ("toggle_comments", "Activer ou désactiver les commentaires d'une publication"),
        ]


class Share(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="+")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "device"], name="interactions_one_share_per_device"),
        ]


class Follower(models.Model):
    device = models.OneToOneField(Device, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)


class PushSubscription(models.Model):
    """Where to send a follower's notifications, as given by their browser."""

    follower = models.ForeignKey(Follower, on_delete=models.CASCADE, related_name="subscriptions")
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(default=timezone.now)
