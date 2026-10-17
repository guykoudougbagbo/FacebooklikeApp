from rest_framework.throttling import SimpleRateThrottle

from utils.api import IPThrottle
from utils.interactions import devices


class CommentIPThrottle(IPThrottle):
    scope = "comment_ip"


class CommentDeviceThrottle(SimpleRateThrottle):
    """Per device. A visitor can drop the cookie or the app's key, so CommentIPThrottle also applies."""

    scope = "comment_device"

    def get_cache_key(self, request, view):
        token = devices.secret(request)
        if not token or len(token) > devices.MAX_LENGTH:
            return None
        return self.cache_format % {"scope": self.scope, "ident": devices.hash_secret(token)}


class ReactionThrottle(IPThrottle):
    scope = "reaction"


class ShareThrottle(IPThrottle):
    scope = "share"


class FollowThrottle(IPThrottle):
    scope = "follow"


class AppDeviceThrottle(IPThrottle):
    scope = "app_device"
