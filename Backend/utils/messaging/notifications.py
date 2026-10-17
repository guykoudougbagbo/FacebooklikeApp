"""Phone notifications for new private messages: "Nouveau message de Awa", never the message itself."""

import logging

from django.conf import settings
from django.db import transaction

from messaging.models import Message
from utils import expo_push
from utils.accounts import app_logins
from utils.messaging import conversations

logger = logging.getLogger(__name__)


def announce(message):
    from messaging.tasks import send_message_notifications

    # After commit, so the worker sees the message.
    transaction.on_commit(lambda: send_message_notifications.delay(message.id))


def send(message_id):
    message = Message.objects.select_related("sender").filter(
        pk=message_id, kind=Message.Kind.TEXT, deleted_at__isnull=True
    ).first()
    if message is None:
        return {"sent": 0, "gone": 0}
    others = [m for m in conversations.member_ids(message.conversation_id) if m != message.sender_id]
    allowed = [user.pk for user in conversations.eligible(others)]
    logins = app_logins.notifiable(allowed)
    body, url = f"Nouveau message de {message.sender.display_name}", f"/admin/messages/{message.conversation_id}"
    sent, gone, receipts = 0, [], {}
    for start in range(0, len(logins), settings.EXPO_PUSH_BATCH_SIZE):
        batch = logins[start:start + settings.EXPO_PUSH_BATCH_SIZE]
        for login, ticket in zip(batch, expo_push.send([expo_push.message(l.push_token, body, url) for l in batch])):
            if ticket.get("status") == "ok":
                sent += 1
                receipts[ticket["id"]] = login.pk
            elif expo_push.gone(ticket):
                gone.append(login.pk)
            else:
                logger.warning("Message push to app login %s failed: %s", login.pk, expo_push.error_code(ticket))
    if gone:
        app_logins.forget_push_tokens(gone)
    if receipts:
        from messaging.tasks import check_message_receipts

        check_message_receipts.apply_async((receipts,), countdown=settings.EXPO_RECEIPT_DELAY_SECONDS)
    return {"sent": sent, "gone": len(gone)}


def check_receipts(receipts):
    """receipts maps ticket id -> app login id."""
    gone = []
    for ticket_id, receipt in expo_push.receipts(receipts).items():
        if receipt.get("status") != "error" or ticket_id not in receipts:
            continue
        if expo_push.gone(receipt):
            gone.append(receipts[ticket_id])
        else:
            logger.warning("Message push to app login %s failed: %s", receipts[ticket_id], expo_push.error_code(receipt))
    if gone:
        app_logins.forget_push_tokens(gone)
    return {"gone": len(gone)}
