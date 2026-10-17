"""Following the page and sending Web Push notifications for new posts."""

import json
import logging
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from pywebpush import WebPushException, webpush

from interactions.models import Follower, PushSubscription
from posts.models import Post

logger = logging.getLogger(__name__)

# Push services answer 404 or 410 when the browser has unsubscribed for good.
GONE = {404, 410}
EXCERPT_LENGTH = 120


class FollowError(Exception):
    """Raised with a message that is safe to show the visitor."""


def page_info(device):
    following = device is not None and Follower.objects.filter(device=device).exists()
    return {"followers": Follower.objects.count(), "following": following}


def follow(device, subscription):
    endpoint, p256dh, auth = _checked(subscription)
    with transaction.atomic():
        follower, _ = Follower.objects.get_or_create(device=device)
        # The same browser endpoint always belongs to whoever subscribed with it last.
        PushSubscription.objects.update_or_create(
            endpoint=endpoint, defaults={"follower": follower, "p256dh": p256dh, "auth": auth}
        )


def unfollow(device):
    Follower.objects.filter(device=device).delete()


def announce(post_id):
    # After commit, so the worker sees the post as published.
    transaction.on_commit(lambda: _queue(post_id, 0))


def _queue(post_id, after_id):
    from interactions.tasks import send_post_notifications

    send_post_notifications.delay(post_id, after_id)


def send_post_notifications(post_id, after_id=0):
    """Notify one batch of followers, then queue the next batch, so huge follower lists never block a worker."""
    post = Post.objects.filter(pk=post_id, status=Post.Status.PUBLISHED).first()
    if post is None:
        return {"sent": 0, "gone": 0}
    batch = list(PushSubscription.objects.filter(id__gt=after_id).order_by("id")[: settings.PUSH_BATCH_SIZE])
    payload = json.dumps({"title": "GenZ", "body": _excerpt(post.body), "url": f"/publication/{post.id}"})
    sent, gone = 0, []
    for subscription in batch:
        try:
            webpush(
                subscription_info={"endpoint": subscription.endpoint,
                                   "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                ttl=settings.PUSH_TTL_SECONDS,
                timeout=settings.PUSH_TIMEOUT_SECONDS,
            )
            sent += 1
        except WebPushException as exc:
            if exc.status_code in GONE:
                gone.append(subscription.id)
            else:
                logger.warning("Push to subscription %s failed: %s", subscription.id, exc.status_code)
    if gone:
        _prune(gone)
    if len(batch) == settings.PUSH_BATCH_SIZE:
        _queue(post_id, batch[-1].id)
    return {"sent": sent, "gone": len(gone)}


def _prune(subscription_ids):
    logger.warning(
        "Push prune %s: subscriptions reported gone %s",
        "applying" if settings.PUSH_PRUNE_APPLY else "log-only, nothing deleted", subscription_ids,
    )
    if settings.PUSH_PRUNE_APPLY:
        PushSubscription.objects.filter(id__in=subscription_ids).delete()


def _excerpt(body):
    text = " ".join(body.split())
    if not text:
        return "Nouvelle publication"
    return text if len(text) <= EXCERPT_LENGTH else text[: EXCERPT_LENGTH - 1] + "…"


def _checked(subscription):
    if not isinstance(subscription, dict):
        raise FollowError("Abonnement invalide.")
    endpoint = subscription.get("endpoint")
    keys = subscription.get("keys") or {}
    p256dh, auth = keys.get("p256dh"), keys.get("auth")
    if not all(isinstance(v, str) and v for v in (endpoint, p256dh, auth)):
        raise FollowError("Abonnement invalide.")
    if len(endpoint) > 1000 or len(p256dh) > 200 or len(auth) > 100:
        raise FollowError("Abonnement invalide.")
    url = urlparse(endpoint)
    host = (url.hostname or "").lower()
    # Only real push services: otherwise anyone could make the server send requests to any address.
    allowed = any(host == s or host.endswith("." + s) for s in settings.PUSH_ALLOWED_HOSTS)
    if url.scheme != "https" or not allowed:
        raise FollowError("Ce navigateur n'est pas pris en charge pour les notifications.")
    return endpoint, p256dh, auth
