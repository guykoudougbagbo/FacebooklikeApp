from django.contrib.auth import password_validation
from rest_framework import serializers

from utils.accounts.roles import role_of


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class CodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


class InviteTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)


class AcceptInviteSerializer(InviteTokenSerializer):
    email = serializers.EmailField(max_length=254)
    display_name = serializers.CharField(min_length=2, max_length=80)
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, data):
        password_validation.validate_password(data["password"])
        return data


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    display_name = serializers.CharField()
    role = serializers.SerializerMethodField()

    def get_role(self, user):
        return role_of(user)


class AdminSerializer(MeSerializer):
    date_joined = serializers.DateTimeField()


class InviteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    created_by = serializers.CharField(source="created_by.display_name")


class ActivitySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    action = serializers.CharField()
    created_at = serializers.DateTimeField()
    actor = serializers.CharField(source="actor.display_name")
    target = serializers.CharField(source="target_user.display_name", default=None)
