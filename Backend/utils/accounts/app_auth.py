"""How requests from the phone app prove which admin sent them: an `Authorization: Bearer <key>` header."""

from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework import status
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import APIException

from utils.accounts import app_logins



class LoginEnded(APIException):
    """Always 401, so the app can tell "log in again" from "not allowed" (403). DRF would turn an
    AuthenticationFailed into 403 here, because the website's session check comes first."""

    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Votre session a expiré. Reconnectez-vous."
    auth_header = "Bearer"


def _key_from(header):
    parts = header.split()
    if not parts or parts[0].lower() != b"bearer":
        return None
    if len(parts) != 2:
        return ""
    try:
        return parts[1].decode("ascii")
    except UnicodeDecodeError:
        return ""


class AppLoginAuthentication(BaseAuthentication):
    """Requests carrying the header need no CSRF check: other websites can't make a browser send it."""

    def authenticate(self, request):
        key = _key_from(get_authorization_header(request))
        if key is None:
            return None
        login = app_logins.find(key)
        if login is None:
            raise LoginEnded
        return login.user, login


class AppLoginWebsocketMiddleware:
    """Lets the app's live connection log in with the same header; website connections keep their session."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        header = dict(scope.get("headers", [])).get(b"authorization", b"")
        key = _key_from(header)
        if key is not None:
            login = await database_sync_to_async(app_logins.find)(key)
            scope = {**scope, "app_login_id": login.pk if login else None,
                     "user": login.user if login else AnonymousUser()}
        return await self.inner(scope, receive, send)
