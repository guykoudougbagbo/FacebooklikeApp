"""Following the page and notifying followers of new posts: Web Push for browsers, Expo for the phone app."""

import json
import logging
import re
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
import requests
from pywebpush import WebPushException, webpush

from interactions.models import Follower, MobilePushToken, PushSubscription
from posts.models import Post

logger = logging.getLogger(__name__)

# Push services answer 404 or 410 when the browser has unsubscribed for good.
GONE = {404, 410}
EXCERPT_LENGTH = 120
EXPO_TOKEN = re.compile(r"Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]")
EXPO_HEADERS = {"Accept": "application/json", "Accept-Encoding": "gzip, deflate"}


class FollowError(Exception):
    """Raised with a message that is safe to show the visitor."""


class PushServiceBusy(Exception):
    """Expo was unreachable or answered 429 or 5xx: the job tries again later."""


class PushRefused(Exception):
    """Expo refused the whole request (4xx); retrying the same request won't help."""

    def __init__(self, status_code):
        super().__init__(status_code)
        self.status_code = status_code


def page_info(device):
    following = device is not None and Follower.objects.filter(device=device).exists()
    return {"followers": Follower.objects.count(), "following": following}


def follow(device, subscription=None, expo_token=None):
    """Browsers give a Web Push subscription; the phone app gives an Expo push token."""
    if expo_token is not None:
        token = _checked_expo_token(expo_token)
        with transaction.atomic():
            follower, _ = Follower.objects.get_or_create(device=device)
            # A phone's token always belongs to whoever followed with it last (for example after a reinstall).
            MobilePushToken.objects.update_or_create(token=token, defaults={"follower": follower})
        return
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
    def queue_both():
        _queue(post_id, 0)
        _queue_app(post_id, 0)

    # After commit, so the worker sees the post as published.
    transaction.on_commit(queue_both)


def _queue(post_id, after_id):
    from interactions.tasks import send_post_notifications

    send_post_notifications.delay(post_id, after_id)


def _queue_app(post_id, after_id):
    from interactions.tasks import send_app_notifications

    send_app_notifications.delay(post_id, after_id)


def _queue_receipts(receipts):
    from interactions.tasks import check_app_receipts

    check_app_receipts.apply_async((receipts,), countdown=settings.EXPO_RECEIPT_DELAY_SECONDS)


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


def send_app_notifications(post_id, after_id=0):
    """Same as send_post_notifications, for the phone app through Expo."""
    post = Post.objects.filter(pk=post_id, status=Post.Status.PUBLISHED).first()
    if post is None:
        return {"sent": 0, "gone": 0}
    batch = list(MobilePushToken.objects.filter(id__gt=after_id).order_by("id")[: settings.EXPO_PUSH_BATCH_SIZE])
    if not batch:
        return {"sent": 0, "gone": 0}
    messages = [
        {"to": t.token, "title": "GenZ", "body": _excerpt(post.body), "data": {"url": f"/publication/{post.id}"},
         "sound": "default", "ttl": settings.PUSH_TTL_SECONDS}
        for t in batch
    ]
    sent, gone, receipts = 0, [], {}
    # Tickets come back in the order the messages were sent.
    for token, ticket in zip(batch, _send_expo(messages)):
        if ticket.get("status") == "ok":
            sent += 1
            receipts[ticket["id"]] = token.id
        elif _expo_error(ticket) == "DeviceNotRegistered":
            gone.append(token.id)
        else:
            logger.warning("App push to token %s failed: %s", token.id, _expo_error(ticket))
    if gone:
        _prune_app(gone)
    if receipts:
        _queue_receipts(receipts)
    if len(batch) == settings.EXPO_PUSH_BATCH_SIZE:
        _queue_app(post_id, batch[-1].id)
    return {"sent": sent, "gone": len(gone)}


def check_app_receipts(receipts):
    """Phones that uninstalled the app are only reported later, in Expo's receipts. receipts maps ticket id -> token id."""
    data = _expo_request(settings.EXPO_RECEIPTS_URL, {"ids": list(receipts)})["data"]
    gone = []
    for ticket_id, receipt in data.items():
        if receipt.get("status") != "error" or ticket_id not in receipts:
            continue
        if _expo_error(receipt) == "DeviceNotRegistered":
            gone.append(receipts[ticket_id])
        else:
            logger.warning("App push to token %s failed: %s", receipts[ticket_id], _expo_error(receipt))
    if gone:
        _prune_app(gone)
    return {"gone": len(gone)}


def _send_expo(messages):
    """One ticket per message. A batch Expo refuses as a whole is split in two, so one bad token can't block the rest."""
    try:
        return _expo_request(settings.EXPO_PUSH_URL, messages)["data"]
    except PushRefused as exc:
        if exc.status_code != 400:
            raise
        if len(messages) == 1:
            return [{"status": "error", "details": {"error": "Refused"}}]
    half = len(messages) // 2
    return _send_expo(messages[:half]) + _send_expo(messages[half:])


def _expo_request(url, body):
    try:
        response = requests.post(url, json=body, headers=EXPO_HEADERS, timeout=settings.PUSH_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise PushServiceBusy(type(exc).__name__) from exc
    if response.status_code == 429 or response.status_code >= 500:
        raise PushServiceBusy(response.status_code)
    if response.status_code != 200:
        logger.warning("Expo refused a request (%s): %s", response.status_code, response.text[:500])
        raise PushRefused(response.status_code)
    return response.json()


def _expo_error(ticket):
    return (ticket.get("details") or {}).get("error") or ticket.get("message")


def _prune_app(token_ids):
    logger.warning(
        "App push prune %s: tokens reported gone %s",
        "applying" if settings.PUSH_PRUNE_APPLY else "log-only, nothing deleted", token_ids,
    )
    if settings.PUSH_PRUNE_APPLY:
        MobilePushToken.objects.filter(id__in=token_ids).delete()


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


def _checked_expo_token(token):
    if not isinstance(token, str) or len(token) > 200 or not EXPO_TOKEN.fullmatch(token):
        raise FollowError("Ce téléphone n'est pas pris en charge pour les notifications.")
    return token
