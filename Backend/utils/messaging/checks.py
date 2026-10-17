"""Start-up check for the live-messages connection to Redis."""

from channels_redis.core import RedisChannelLayer
from django.conf import settings
from django.core.checks import Error


def socket_timeout_outlasts_waits(app_configs, **kwargs):
    # channels_redis waits up to brpop_timeout seconds for new events; the redis library gives up reading after
    # socket_timeout (5 s by default since redis 8). If it gives up first, every idle live connection breaks.
    waits = RedisChannelLayer.brpop_timeout
    if settings.CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS <= waits:
        return [Error(
            f"CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS must be more than {waits} seconds (how long live connections "
            "wait for new events), or idle live connections break.",
            id="messaging.E001",
        )]
    return []
