import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Loads Django before anything that touches models.
django_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

from messaging.routing import websocket_urlpatterns  # noqa: E402
from utils.accounts.app_auth import AppLoginWebsocketMiddleware  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_app,
    # Live connections must name this site as their origin and carry a logged-in session (website) or the
    # app's login key (phone app).
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(AppLoginWebsocketMiddleware(URLRouter(websocket_urlpatterns)))
    ),
})
