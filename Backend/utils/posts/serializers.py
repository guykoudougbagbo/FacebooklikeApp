from django.core.files.storage import default_storage
from rest_framework import serializers

from utils.posts.posts import can_delete, can_edit


def _url(name):
    return default_storage.url(name) if name else None


class MediaSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    kind = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    # Photos
    feed_url = serializers.SerializerMethodField()
    full_url = serializers.SerializerMethodField()
    # Videos
    video_url = serializers.SerializerMethodField()
    poster_url = serializers.SerializerMethodField()
    duration_seconds = serializers.FloatField()

    def get_feed_url(self, item):
        return _url(item.feed_name)

    def get_full_url(self, item):
        return _url(item.full_name)

    def get_video_url(self, item):
        return _url(item.video_name)

    def get_poster_url(self, item):
        return _url(item.poster_name)


class AdminMediaSerializer(MediaSerializer):
    status = serializers.CharField()


class PublicPostSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    body = serializers.CharField()
    published_at = serializers.DateTimeField()
    edited_at = serializers.DateTimeField()
    media = MediaSerializer(source="visible_media", many=True)


class AdminPostSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    body = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    published_at = serializers.DateTimeField()
    edited_at = serializers.DateTimeField()
    author = serializers.CharField(source="author.display_name")
    media = AdminMediaSerializer(source="visible_media", many=True)
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    def get_can_edit(self, post):
        return can_edit(self.context["request"].user, post)

    def get_can_delete(self, post):
        return can_delete(self.context["request"].user, post)
