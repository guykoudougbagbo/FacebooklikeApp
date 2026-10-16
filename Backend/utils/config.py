import os

from django.core.exceptions import ImproperlyConfigured


def require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(
            f"Missing required setting {name}. Set it in the environment or in Backend/.env (see Backend/.env.example)."
        )
    return value


def require_bool(name):
    value = require_env(name).lower()
    if value == "true":
        return True
    if value == "false":
        return False
    raise ImproperlyConfigured(f"Setting {name} must be 'true' or 'false'.")


def require_int(name):
    value = require_env(name)
    try:
        return int(value)
    except ValueError:
        raise ImproperlyConfigured(f"Setting {name} must be a whole number.") from None


def require_list(name):
    items = [item.strip() for item in require_env(name).split(",") if item.strip()]
    if not items:
        raise ImproperlyConfigured(f"Setting {name} must list at least one value.")
    return items
