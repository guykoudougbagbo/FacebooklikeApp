from rest_framework.throttling import SimpleRateThrottle

from utils.accounts.app_logins import ticket_user_id
from utils.accounts.sessions import PENDING_KEY
from utils.api import FieldThrottle, IPThrottle


class LoginIPThrottle(IPThrottle):
    scope = "login_ip"


class LoginAccountThrottle(FieldThrottle):
    scope = "login_account"
    field = "email"


class SecondStepThrottle(SimpleRateThrottle):
    """Limits code guesses per account waiting on its second login step."""

    scope = "second_step"

    def get_cache_key(self, request, view):
        pending = request.session.get(PENDING_KEY) or {}
        ident = pending.get("user_id") or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AppSecondStepThrottle(SimpleRateThrottle):
    """The same limit on code guesses for the phone app, counted per account named in the login ticket."""

    scope = "second_step"

    def get_cache_key(self, request, view):
        ticket = request.data.get("ticket") if hasattr(request.data, "get") else None
        ident = ticket_user_id(ticket) or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class InviteThrottle(IPThrottle):
    scope = "invite"
