"""Private conversations between admins: who may see them, and every change to them."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Max, Q
from django.utils import timezone

from messaging.models import Conversation, DirectPair, Membership, Message
from utils.messaging import realtime


class MessagingError(Exception):
    """Raised with a message that is safe to show the admin."""


class NotFound(Exception):
    """The conversation or message doesn't exist, or this admin isn't allowed to see it."""


# --- Who can take part -----------------------------------------------------

def _eligible(user_ids):
    """Active admins who may use messaging, from these ids."""
    users = get_user_model().objects.filter(pk__in=user_ids, is_active=True).prefetch_related("groups")
    return [u for u in users if u.has_perm("messaging.use_messaging")]


def _membership(conversation_id, user):
    membership = Membership.objects.select_related("conversation").filter(
        conversation_id=conversation_id, user=user
    ).first()
    if membership is None:
        raise NotFound
    return membership


def member_ids(conversation_id):
    return list(Membership.objects.filter(conversation_id=conversation_id).values_list("user_id", flat=True))


# --- Reading ---------------------------------------------------------------

def conversations_for(user):
    return (
        Conversation.objects.filter(memberships__user=user)
        .annotate(latest_id=Max("messages__id"))
        .prefetch_related("memberships__user")
    )


def get_conversation(conversation_id, user):
    _membership(conversation_id, user)
    return conversations_for(user).get(pk=conversation_id)


def latest_messages(conversation_ids):
    """{conversation_id: its newest message}, in two queries."""
    latest = (
        Message.objects.filter(conversation_id__in=conversation_ids)
        .values("conversation_id").annotate(latest=Max("id")).values_list("latest", flat=True)
    )
    messages = Message.objects.filter(id__in=list(latest)).select_related("sender", "target_user")
    return {m.conversation_id: m for m in messages}


def unread_flags(user, conversation_ids):
    """{conversation_id: True when someone else wrote after this admin's last read message}."""
    rows = Membership.objects.filter(user=user, conversation_id__in=conversation_ids).annotate(
        latest_other=Max("conversation__messages__id", filter=~Q(conversation__messages__sender=user))
    ).values_list("conversation_id", "latest_other", "last_read_message_id")
    return {cid: bool(other and other > (read or 0)) for cid, other, read in rows}


def unread_count(user):
    return sum(unread_flags(user, Membership.objects.filter(user=user).values_list("conversation_id", flat=True)).values())


def messages_for(conversation_id, user):
    _membership(conversation_id, user)
    return Message.objects.filter(conversation_id=conversation_id).select_related("sender", "target_user")


# --- Starting conversations ------------------------------------------------

def start_direct(user, other_id):
    if other_id == user.pk:
        raise MessagingError("Choisissez une autre personne.")
    if not _eligible([other_id]):
        raise MessagingError("Cette personne ne peut pas recevoir de messages.")
    low, high = sorted([user.pk, other_id])
    existing = DirectPair.objects.filter(user_low_id=low, user_high_id=high).first()
    if existing:
        return existing.conversation_id
    try:
        with transaction.atomic():
            conversation = Conversation.objects.create(kind=Conversation.Kind.DIRECT)
            DirectPair.objects.create(conversation=conversation, user_low_id=low, user_high_id=high)
            Membership.objects.bulk_create([Membership(conversation=conversation, user_id=uid) for uid in (low, high)])
            _event(conversation, user, Message.Event.CREATED)
    except IntegrityError:
        # The other admin started the same conversation at the same moment.
        return DirectPair.objects.get(user_low_id=low, user_high_id=high).conversation_id
    return conversation.id


def create_group(user, title, member_ids_):
    title = _clean_title(title)
    others = [u for u in _eligible(set(member_ids_) - {user.pk})]
    if not others:
        raise MessagingError("Ajoutez au moins une autre personne.")
    if len(others) + 1 > settings.GROUP_MAX_MEMBERS:
        raise MessagingError(f"Un groupe peut compter au maximum {settings.GROUP_MAX_MEMBERS} personnes.")
    with transaction.atomic():
        conversation = Conversation.objects.create(kind=Conversation.Kind.GROUP, title=title, manager=user)
        Membership.objects.bulk_create(
            [Membership(conversation=conversation, user=member) for member in [user, *others]]
        )
        _event(conversation, user, Message.Event.CREATED)
    return conversation.id


# --- Managing groups -------------------------------------------------------

def rename_group(conversation_id, user, title):
    with transaction.atomic():
        conversation = _managed_group(conversation_id, user)
        conversation.title = _clean_title(title)
        conversation.save(update_fields=["title"])
        _event(conversation, user, Message.Event.RENAMED, body=conversation.title)


def add_member(conversation_id, user, new_id):
    with transaction.atomic():
        conversation = _managed_group(conversation_id, user)
        if Membership.objects.filter(conversation=conversation, user_id=new_id).exists():
            raise MessagingError("Cette personne fait déjà partie du groupe.")
        new = _eligible([new_id])
        if not new:
            raise MessagingError("Cette personne ne peut pas recevoir de messages.")
        if Membership.objects.filter(conversation=conversation).count() >= settings.GROUP_MAX_MEMBERS:
            raise MessagingError(f"Un groupe peut compter au maximum {settings.GROUP_MAX_MEMBERS} personnes.")
        Membership.objects.create(conversation=conversation, user=new[0])
        _event(conversation, user, Message.Event.ADDED, target=new[0])


def remove_member(conversation_id, user, target_id):
    """The manager removes someone, or any member removes themselves (leaves)."""
    with transaction.atomic():
        membership = _membership(conversation_id, user)
        conversation = Conversation.objects.select_for_update().get(pk=membership.conversation_id)
        if conversation.kind != Conversation.Kind.GROUP:
            raise MessagingError("On ne peut pas quitter une conversation à deux.")
        if target_id != user.pk and conversation.manager_id != user.pk:
            raise PermissionError
        target = Membership.objects.filter(conversation=conversation, user_id=target_id).select_related("user").first()
        if target is None:
            raise NotFound
        _leave(conversation, target, actor=user)


def remove_from_all_groups(removed_user, acting_user):
    """When an admin is removed from the team, they also leave every group, so they can never read it again."""
    for membership in Membership.objects.filter(
        user=removed_user, conversation__kind=Conversation.Kind.GROUP
    ).select_related("conversation", "user").order_by("conversation_id"):
        with transaction.atomic():
            conversation = Conversation.objects.select_for_update().get(pk=membership.conversation_id)
            _leave(conversation, membership, actor=acting_user)


def _leave(conversation, membership, actor):
    leaving = membership.user
    kept = list(member_ids(conversation.id))
    membership.delete()
    remaining = [uid for uid in kept if uid != leaving.pk]
    if not remaining:
        conversation.delete()
        realtime.notify([leaving.pk], {"type": "removed", "conversation": conversation.id})
        return
    if conversation.manager_id == leaving.pk:
        # The longest-standing member takes over, so the group always has someone to manage it.
        conversation.manager_id = (
            Membership.objects.filter(conversation=conversation).order_by("joined_at", "id").values_list("user_id", flat=True).first()
        )
        conversation.save(update_fields=["manager"])
    event = Message.Event.LEFT if actor.pk == leaving.pk else Message.Event.REMOVED
    _event(conversation, actor, event, target=leaving)
    realtime.notify([leaving.pk], {"type": "removed", "conversation": conversation.id})


def _managed_group(conversation_id, user):
    _membership(conversation_id, user)
    conversation = Conversation.objects.select_for_update().get(pk=conversation_id)
    if conversation.kind != Conversation.Kind.GROUP or conversation.manager_id != user.pk:
        raise PermissionError
    return conversation


def _clean_title(title):
    title = " ".join(title.split()) if isinstance(title, str) else ""
    if not title:
        raise MessagingError("Donnez un nom au groupe.")
    if len(title) > 80:
        raise MessagingError("Le nom du groupe dépasse 80 caractères.")
    return title


# --- Messages --------------------------------------------------------------

def send_message(conversation_id, user, body):
    body = body.replace("\r\n", "\n").replace("\x00", "").strip() if isinstance(body, str) else ""
    if not body:
        raise MessagingError("Le message est vide.")
    if len(body) > settings.MESSAGE_MAX_LENGTH:
        raise MessagingError(f"Le message dépasse {settings.MESSAGE_MAX_LENGTH} caractères.")
    with transaction.atomic():
        membership = _membership(conversation_id, user)
        message = Message.objects.create(conversation_id=conversation_id, sender=user, body=body)
        membership.last_read_message = message
        membership.save(update_fields=["last_read_message"])
        _announce(message)
    return message


def delete_message(message_id, user):
    with transaction.atomic():
        message = Message.objects.select_for_update().filter(pk=message_id, kind=Message.Kind.TEXT).first()
        if message is None or not Membership.objects.filter(conversation_id=message.conversation_id, user=user).exists():
            raise NotFound
        if message.sender_id != user.pk:
            raise PermissionError
        if message.deleted_at is None:
            message.deleted_at, message.body = timezone.now(), ""
            message.save(update_fields=["deleted_at", "body"])
            realtime.notify(member_ids(message.conversation_id),
                            {"type": "message_deleted", "conversation": message.conversation_id, "message_id": message.id})


def mark_read(conversation_id, user, message_id):
    with transaction.atomic():
        membership = Membership.objects.select_for_update().filter(conversation_id=conversation_id, user=user).first()
        if membership is None or not Message.objects.filter(pk=message_id, conversation_id=conversation_id).exists():
            raise NotFound
        # Only ever moves forward, so a late request can't mark newer messages unread again.
        if (membership.last_read_message_id or 0) < message_id:
            membership.last_read_message_id = message_id
            membership.save(update_fields=["last_read_message"])
            realtime.notify(member_ids(conversation_id),
                            {"type": "read", "conversation": conversation_id, "user_id": user.pk, "message_id": message_id})


def _event(conversation, actor, event, target=None, body=""):
    message = Message.objects.create(
        conversation=conversation, sender=actor, kind=Message.Kind.EVENT, event=event, target_user=target, body=body
    )
    _announce(message)
    return message


def _announce(message):
    from utils.messaging.serializers import MessageSerializer

    realtime.notify(
        member_ids(message.conversation_id),
        {"type": "message", "conversation": message.conversation_id, "message": MessageSerializer(message).data},
    )
