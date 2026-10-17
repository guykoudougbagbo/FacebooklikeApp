"""Reactions, comments and shares on published posts, plus the counts shown under each post."""

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count

from interactions.models import Comment, Reaction, Share
from posts.models import Post


class InteractionError(Exception):
    """Raised with a message that is safe to show the visitor."""


class NotFound(Exception):
    pass


def published_post(post_id):
    post = Post.objects.filter(pk=post_id, status=Post.Status.PUBLISHED).first()
    if post is None:
        raise NotFound
    return post


# --- Reactions -------------------------------------------------------------

def react(post_id, device, kind):
    if kind not in Reaction.Kind.values:
        raise InteractionError("Réaction inconnue.")
    post = published_post(post_id)
    Reaction.objects.update_or_create(post=post, device=device, defaults={"kind": kind})


def unreact(post_id, device):
    Reaction.objects.filter(post_id=post_id, device=device).delete()


# --- Comments --------------------------------------------------------------

def visitor_comments(post_id):
    published_post(post_id)
    return Comment.objects.filter(post_id=post_id).order_by("id")


def add_visitor_comment(post_id, device, name, body):
    post = published_post(post_id)
    if not post.comments_enabled:
        raise InteractionError("Les commentaires sont désactivés pour cette publication.")
    name = _clean_line(name)
    if not name:
        raise InteractionError("Indiquez votre nom.")
    if len(name) > settings.COMMENT_NAME_MAX_LENGTH:
        raise InteractionError(f"Le nom dépasse {settings.COMMENT_NAME_MAX_LENGTH} caractères.")
    return Comment.objects.create(post=post, device=device, display_name=name, body=_clean_body(body))


def add_page_reply(post_id, admin, body):
    post = published_post(post_id)
    return Comment.objects.create(post=post, page_author=admin, body=_clean_body(body))


def delete_comment(comment_id):
    return Comment.objects.filter(pk=comment_id).delete()[0] > 0


def set_comments_enabled(post_id, enabled):
    return Post.objects.filter(pk=post_id).update(comments_enabled=enabled) > 0


def _clean_line(value):
    return " ".join(value.split()) if isinstance(value, str) else ""


def _clean_body(body):
    body = body if isinstance(body, str) else ""
    body = body.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    if not body:
        raise InteractionError("Le commentaire est vide.")
    if len(body) > settings.COMMENT_MAX_LENGTH:
        raise InteractionError(f"Le commentaire dépasse {settings.COMMENT_MAX_LENGTH} caractères.")
    return body


# --- Shares ----------------------------------------------------------------

def record_share(post_id, device):
    post = published_post(post_id)
    try:
        with transaction.atomic():
            Share.objects.create(post=post, device=device)
    except IntegrityError:
        pass  # Already counted for this device.


# --- Counts ------------------------------------------------------------------

def summaries(post_ids, device):
    """Counts for many posts in a fixed number of queries: {post_id: {...}}."""
    post_ids = list(post_ids)
    result = {pid: {"reactions": {}, "comments": 0, "shares": 0, "my_reaction": None} for pid in post_ids}
    if not post_ids:
        return result
    for row in Reaction.objects.filter(post_id__in=post_ids).values("post_id", "kind").annotate(n=Count("id")):
        result[row["post_id"]]["reactions"][row["kind"]] = row["n"]
    for row in Comment.objects.filter(post_id__in=post_ids).values("post_id").annotate(n=Count("id")):
        result[row["post_id"]]["comments"] = row["n"]
    for row in Share.objects.filter(post_id__in=post_ids).values("post_id").annotate(n=Count("id")):
        result[row["post_id"]]["shares"] = row["n"]
    if device is not None:
        for row in Reaction.objects.filter(post_id__in=post_ids, device=device).values("post_id", "kind"):
            result[row["post_id"]]["my_reaction"] = row["kind"]
    return result
