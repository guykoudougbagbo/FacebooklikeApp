"""Shared building blocks for API routes."""

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import BasePermission
from rest_framework.throttling import SimpleRateThrottle


def has_permission(app_label, codename):
    """A DRF permission class requiring one registry permission."""

    class _HasPermission(BasePermission):
        def has_permission(self, request, view):
            return bool(request.user and request.user.is_authenticated
                        and request.user.has_perm(f"{app_label}.{codename}"))

    _HasPermission.__name__ = f"Has_{app_label}_{codename}"
    return _HasPermission


def csrf_checked(view_class):
    """DRF skips CSRF checks for logged-out requests; public form routes still need them."""
    return method_decorator(csrf_protect, name="dispatch")(view_class)


class NewestFirstPagination(CursorPagination):
    ordering = "-id"


class OldestFirstPagination(CursorPagination):
    ordering = "id"


class IPThrottle(SimpleRateThrottle):
    """Limits by client IP. Set `scope` on a subclass; the rate comes from settings."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class FieldThrottle(SimpleRateThrottle):
    """Limits by a request field (for example the email being tried), whatever IP it comes from."""

    field = None

    def get_cache_key(self, request, view):
        value = request.data.get(self.field) if hasattr(request.data, "get") else None
        if not isinstance(value, str) or not value.strip():
            return None
        return self.cache_format % {"scope": self.scope, "ident": value.strip().lower()[:254]}
