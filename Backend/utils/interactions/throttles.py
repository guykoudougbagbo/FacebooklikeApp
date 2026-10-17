from rest_framework.throttling import SimpleRateThrottle

from utils.api import IPThrottle
from utils.interactions.devices import COOKIE_NAME


class CommentIPThrottle(IPThrottle):
    scope = "comment_ip"


class CommentDeviceThrottle(SimpleRateThrottle):
    """Per device cookie. A visitor can drop the cookie, so CommentIPThrottle also applies."""

    scope = "comment_device"

    def get_cache_key(self, request, view):
        token = request.COOKIES.get(COOKIE_NAME)
        if not token:
            return None
        return self.cache_format % {"scope": self.scope, "ident": token[:100]}


class ReactionThrottle(IPThrottle):
    scope = "reaction"


class ShareThrottle(IPThrottle):
    scope = "share"


class FollowThrottle(IPThrottle):
    scope = "follow"
