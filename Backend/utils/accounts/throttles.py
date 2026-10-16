from rest_framework.throttling import SimpleRateThrottle

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


class InviteThrottle(IPThrottle):
    scope = "invite"
