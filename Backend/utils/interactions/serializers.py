from rest_framework import serializers

PAGE_NAME = "GenZ"


class CommentSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.SerializerMethodField()
    is_page = serializers.SerializerMethodField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()

    def get_name(self, comment):
        # Replies by admins show the page, never the admin's own name.
        return PAGE_NAME if comment.page_author_id else comment.display_name

    def get_is_page(self, comment):
        return comment.page_author_id is not None


class InteractionsField(serializers.Field):
    """Reaction counts, comment and share counts, and this device's reaction, for a post."""

    def __init__(self, **kwargs):
        super().__init__(source="*", read_only=True, **kwargs)

    def to_representation(self, post):
        from utils.interactions import activity, devices

        summaries = self.context.get("summaries")
        if summaries is None or post.id not in summaries:
            summaries = activity.summaries([post.id], devices.current(self.context["request"]))
        return summaries[post.id]


class WithSummaries:
    """For list views: computes every listed post's counts in a few queries instead of a few per post."""

    def get_serializer(self, *args, **kwargs):
        from utils.interactions import activity, devices

        if kwargs.get("many") and args:
            page = list(args[0])
            context = kwargs.setdefault("context", self.get_serializer_context())
            context["summaries"] = activity.summaries([p.id for p in page], devices.current(self.request))
            args = (page, *args[1:])
        return super().get_serializer(*args, **kwargs)
