from django.core.files.storage import default_storage
from rest_framework import serializers

from utils.posts.posts import can_delete, can_edit


class PhotoSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    feed_url = serializers.SerializerMethodField()
    full_url = serializers.SerializerMethodField()

    def get_feed_url(self, photo):
        return default_storage.url(photo.feed_name) if photo.feed_name else None

    def get_full_url(self, photo):
        return default_storage.url(photo.full_name) if photo.full_name else None


class AdminPhotoSerializer(PhotoSerializer):
    status = serializers.CharField()


class PublicPostSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    body = serializers.CharField()
    published_at = serializers.DateTimeField()
    edited_at = serializers.DateTimeField()
    photos = PhotoSerializer(source="visible_photos", many=True)


class AdminPostSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    body = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    published_at = serializers.DateTimeField()
    edited_at = serializers.DateTimeField()
    author = serializers.CharField(source="author.display_name")
    photos = AdminPhotoSerializer(source="visible_photos", many=True)
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    def get_can_edit(self, post):
        return can_edit(self.context["request"].user, post)

    def get_can_delete(self, post):
        return can_delete(self.context["request"].user, post)
