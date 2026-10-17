"""Sending phone notifications through Expo's push service, shared by visitor and admin notifications."""

import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TOKEN = re.compile(r"Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]")
TOKEN_MAX_LENGTH = 200
HEADERS = {"Accept": "application/json", "Accept-Encoding": "gzip, deflate"}


class PushServiceBusy(Exception):
    """Expo was unreachable or answered 429 or 5xx: the job tries again later."""


class PushRefused(Exception):
    """Expo refused the whole request (4xx); retrying the same request won't help."""

    def __init__(self, status_code):
        super().__init__(status_code)
        self.status_code = status_code


def is_token(value):
    return isinstance(value, str) and len(value) <= TOKEN_MAX_LENGTH and bool(TOKEN.fullmatch(value))


def message(token, body, url):
    return {"to": token, "title": "GenZ", "body": body, "data": {"url": url}, "sound": "default",
            "ttl": settings.PUSH_TTL_SECONDS}


def send(messages):
    """One ticket per message. A batch Expo refuses as a whole is split in two, so one bad token can't block the rest."""
    try:
        return _request(settings.EXPO_PUSH_URL, messages)["data"]
    except PushRefused as exc:
        if exc.status_code != 400:
            raise
        if len(messages) == 1:
            return [{"status": "error", "details": {"error": "Refused"}}]
    half = len(messages) // 2
    return send(messages[:half]) + send(messages[half:])


def receipts(ticket_ids):
    """Expo's receipts for these tickets: phones where the app was uninstalled are only reported here."""
    return _request(settings.EXPO_RECEIPTS_URL, {"ids": list(ticket_ids)})["data"]


def error_code(ticket):
    return (ticket.get("details") or {}).get("error") or ticket.get("message")


def gone(ticket):
    return ticket.get("status") == "error" and error_code(ticket) == "DeviceNotRegistered"


def retry_when_busy(task, job, *args):
    """Runs job(*args) inside a bound Celery task, trying again later while Expo is busy."""
    try:
        return job(*args)
    except PushServiceBusy as exc:
        # Expo asks for exponential backoff when it is busy.
        countdown = settings.EXPO_RETRY_BASE_SECONDS * 2 ** task.request.retries
        raise task.retry(exc=exc, countdown=countdown, max_retries=settings.EXPO_PUSH_MAX_RETRIES) from exc


def _request(url, body):
    try:
        response = requests.post(url, json=body, headers=HEADERS, timeout=settings.PUSH_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise PushServiceBusy(type(exc).__name__) from exc
    if response.status_code == 429 or response.status_code >= 500:
        raise PushServiceBusy(response.status_code)
    if response.status_code != 200:
        logger.warning("Expo refused a request (%s): %s", response.status_code, response.text[:500])
        raise PushRefused(response.status_code)
    return response.json()
