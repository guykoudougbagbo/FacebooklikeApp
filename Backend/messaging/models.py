from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Conversation(models.Model):
    """A private conversation between admins. Only its members can see it."""

    class Kind(models.TextChoices):
        DIRECT = "direct"
        GROUP = "group"

    kind = models.CharField(max_length=8, choices=Kind.choices)
    # Groups only; one-on-one conversations show the other person's name.
    title = models.CharField(max_length=80, blank=True)
    # Groups: who may rename it and add or remove members. The creator at first; passed on if they leave.
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        permissions = [("use_messaging", "Envoyer et lire des messages privés")]


class Membership(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    joined_at = models.DateTimeField(default=timezone.now)
    last_read_message = models.ForeignKey(
        "Message", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["conversation", "user"], name="messaging_one_membership"),
        ]


class DirectPair(models.Model):
    """Makes sure two admins have at most one one-on-one conversation."""

    conversation = models.OneToOneField(Conversation, on_delete=models.CASCADE, related_name="+")
    user_low = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    user_high = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user_low", "user_high"], name="messaging_one_direct_per_pair"),
            models.CheckConstraint(condition=Q(user_low__lt=F("user_high")), name="messaging_pair_ordered"),
        ]


class Message(models.Model):
    class Kind(models.TextChoices):
        TEXT = "text"
        EVENT = "event"

    class Event(models.TextChoices):
        CREATED = "created"
        ADDED = "added"
        REMOVED = "removed"
        LEFT = "left"
        RENAMED = "renamed"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    # The writer of a text, or the person who caused an event.
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.TEXT)
    event = models.CharField(max_length=8, choices=Event.choices, blank=True)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # A text message, or a group's new name for a "renamed" event.
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(kind="text", event="") | (Q(kind="event") & ~Q(event="")),
                name="messaging_event_matches_kind",
            ),
        ]
        indexes = [models.Index(fields=["conversation", "id"], name="messaging_message_conv_idx")]
