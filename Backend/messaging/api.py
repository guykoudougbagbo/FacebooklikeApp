from rest_framework import generics, status
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from utils.api import NewestFirstPagination, has_permission
from utils.messaging import conversations
from utils.messaging.serializers import ConversationSerializer, MessageSerializer

UsesMessaging = has_permission("messaging", "use_messaging")
NOT_FOUND = "Conversation introuvable."


class MessageThrottle(UserRateThrottle):
    scope = "message"


class LatestActivityPagination(CursorPagination):
    ordering = "-latest_id"


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _guarded(action):
    """Runs action() and turns the logic's refusals into answers."""
    try:
        return action()
    except conversations.NotFound:
        return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
    except PermissionError:
        return _error("Seule la personne qui gère le groupe peut faire cela.", status.HTTP_403_FORBIDDEN)
    except conversations.MessagingError as exc:
        return _error(str(exc))


class ConversationContextMixin:
    def conversation_context(self, items):
        ids = [c.id for c in items]
        return {
            "request": self.request,
            "latest": conversations.latest_messages(ids),
            "unread": conversations.unread_flags(self.request.user, ids),
        }

    def one(self, conversation_id):
        conversation = conversations.get_conversation(conversation_id, self.request.user)
        return ConversationSerializer(conversation, context=self.conversation_context([conversation])).data


class ConversationListView(ConversationContextMixin, generics.ListAPIView):
    permission_classes = [UsesMessaging]
    pagination_class = LatestActivityPagination

    def get_queryset(self):
        return conversations.conversations_for(self.request.user)

    def list(self, request, *args, **kwargs):
        page = list(self.paginate_queryset(self.get_queryset()))
        data = ConversationSerializer(page, many=True, context=self.conversation_context(page)).data
        return self.get_paginated_response(data)

    def post(self, request):
        def action():
            kind = request.data.get("kind")
            if kind == "direct":
                conversation_id = conversations.start_direct(request.user, _int(request.data.get("user_id")))
            elif kind == "group":
                ids = [_int(i) for i in request.data.get("member_ids") or []]
                conversation_id = conversations.create_group(request.user, request.data.get("title"), ids)
            else:
                return _error("Type de conversation inconnu.")
            return Response(self.one(conversation_id), status=status.HTTP_201_CREATED)
        return _guarded(action)


class ConversationDetailView(ConversationContextMixin, APIView):
    permission_classes = [UsesMessaging]

    def get(self, request, pk):
        return _guarded(lambda: Response(self.one(pk)))

    def patch(self, request, pk):
        def action():
            conversations.rename_group(pk, request.user, request.data.get("title"))
            return Response(self.one(pk))
        return _guarded(action)


class MemberListView(ConversationContextMixin, APIView):
    permission_classes = [UsesMessaging]

    def post(self, request, pk):
        def action():
            conversations.add_member(pk, request.user, _int(request.data.get("user_id")))
            return Response(self.one(pk), status=status.HTTP_201_CREATED)
        return _guarded(action)


class MemberDetailView(APIView):
    permission_classes = [UsesMessaging]

    def delete(self, request, pk, user_id):
        def action():
            conversations.remove_member(pk, request.user, user_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        return _guarded(action)


class MessageListView(generics.ListAPIView):
    permission_classes = [UsesMessaging]
    serializer_class = MessageSerializer
    pagination_class = NewestFirstPagination

    def get_throttles(self):
        return [MessageThrottle()] if self.request.method == "POST" else []

    def list(self, request, *args, **kwargs):
        return _guarded(lambda: super(MessageListView, self).list(request, *args, **kwargs))

    def get_queryset(self):
        return conversations.messages_for(self.kwargs["pk"], self.request.user)

    def post(self, request, pk):
        def action():
            message = conversations.send_message(pk, request.user, request.data.get("body"))
            return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)
        return _guarded(action)


class MessageDetailView(APIView):
    permission_classes = [UsesMessaging]

    def delete(self, request, pk):
        def action():
            conversations.delete_message(pk, request.user)
            return Response(status=status.HTTP_204_NO_CONTENT)
        return _guarded(action)


class ReadView(APIView):
    permission_classes = [UsesMessaging]

    def post(self, request, pk):
        def action():
            conversations.mark_read(pk, request.user, _int(request.data.get("message_id")))
            return Response(status=status.HTTP_204_NO_CONTENT)
        return _guarded(action)


class UnreadView(APIView):
    permission_classes = [UsesMessaging]

    def get(self, request):
        return Response({"count": conversations.unread_count(request.user)})


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise conversations.MessagingError("Identifiant invalide.") from None
