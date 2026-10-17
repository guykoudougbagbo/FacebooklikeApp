from rest_framework import serializers


def _person(user):
    return {"id": user.pk, "name": user.display_name} if user else None


class MessageSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    kind = serializers.CharField()
    event = serializers.CharField()
    sender = serializers.SerializerMethodField()
    target = serializers.SerializerMethodField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()
    deleted = serializers.SerializerMethodField()

    def get_sender(self, message):
        return _person(message.sender)

    def get_target(self, message):
        return _person(message.target_user)

    def get_deleted(self, message):
        return message.deleted_at is not None


class ConversationSerializer(serializers.Serializer):
    """Needs context: request, latest ({conversation_id: Message}) and unread ({conversation_id: bool})."""

    id = serializers.IntegerField()
    kind = serializers.CharField()
    title = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    manager_id = serializers.IntegerField()
    read_state = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()

    def _me(self):
        return self.context["request"].user

    def get_title(self, conversation):
        if conversation.kind == "group":
            return conversation.title
        other = next((m.user for m in conversation.memberships.all() if m.user_id != self._me().pk), None)
        return other.display_name if other else ""

    def get_members(self, conversation):
        return [_person(m.user) for m in sorted(conversation.memberships.all(), key=lambda m: m.joined_at)]

    def get_read_state(self, conversation):
        return {str(m.user_id): m.last_read_message_id for m in conversation.memberships.all()}

    def get_last_message(self, conversation):
        message = self.context["latest"].get(conversation.id)
        return MessageSerializer(message).data if message else None

    def get_unread(self, conversation):
        return self.context["unread"].get(conversation.id, False)
