from django.conf import settings
from django.core.files.storage import default_storage
from django.http import Http404, HttpResponse
from django.utils.html import format_html
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.models import PostMedia
from utils.api import OldestFirstPagination, csrf_checked, has_permission
from utils.interactions import activity, devices, follows
from utils.interactions.serializers import CommentSerializer
from utils.interactions.throttles import (
    CommentDeviceThrottle,
    CommentIPThrottle,
    FollowThrottle,
    ReactionThrottle,
    ShareThrottle,
)
from utils.posts import posts

NOT_FOUND = "Publication introuvable."


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _with_device(request, handler):
    """Runs handler(device) with the visitor's device, creating it (and its cookie) on first use."""
    device, new_token = devices.current_or_new(request)
    try:
        response = handler(device)
    except activity.NotFound:
        response = _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
    except (activity.InteractionError, follows.FollowError) as exc:
        response = _error(str(exc))
    return devices.set_cookie(response, new_token)


def _summary(request, post_id):
    return activity.summaries([post_id], devices.current(request))[post_id]


# --- Visitors --------------------------------------------------------------
# Public: visitors interact without accounts; each route is limited per network address.

@csrf_checked
class ReactionView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ReactionThrottle]

    def post(self, request, pk):
        def handler(device):
            activity.react(pk, device, request.data.get("kind"))
            return Response(activity.summaries([pk], device)[pk])
        return _with_device(request, handler)

    def delete(self, request, pk):
        def handler(device):
            activity.unreact(pk, device)
            return Response(activity.summaries([pk], device)[pk])
        return _with_device(request, handler)


@csrf_checked
class CommentListCreateView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = CommentSerializer
    pagination_class = OldestFirstPagination

    def get_throttles(self):
        if self.request.method == "POST":
            return [CommentIPThrottle(), CommentDeviceThrottle()]
        return []

    def get_queryset(self):
        try:
            return activity.visitor_comments(self.kwargs["pk"])
        except activity.NotFound:
            raise Http404 from None

    def post(self, request, pk):
        # The hidden "website" field is invisible to people; only spam robots fill it in.
        if request.data.get("website"):
            return _error("Commentaire refusé.")

        def handler(device):
            comment = activity.add_visitor_comment(pk, device, request.data.get("name"), request.data.get("body"))
            return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)
        return _with_device(request, handler)


@csrf_checked
class ShareView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ShareThrottle]

    def post(self, request, pk):
        def handler(device):
            activity.record_share(pk, device)
            return Response(activity.summaries([pk], device)[pk])
        return _with_device(request, handler)


class PageView(APIView):
    # Public: anyone may see the follower count and get the key needed to subscribe.
    permission_classes = [AllowAny]

    def get(self, request):
        info = follows.page_info(devices.current(request))
        return Response({**info, "push_public_key": settings.VAPID_PUBLIC_KEY})


@csrf_checked
class FollowView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [FollowThrottle]

    def post(self, request):
        def handler(device):
            follows.follow(device, request.data.get("subscription"))
            return Response(follows.page_info(device))
        return _with_device(request, handler)

    def delete(self, request):
        def handler(device):
            follows.unfollow(device)
            return Response(follows.page_info(device))
        return _with_device(request, handler)


# --- Admins ----------------------------------------------------------------

class AdminCommentDeleteView(APIView):
    permission_classes = [has_permission("interactions", "delete_any_comment")]

    def delete(self, request, pk):
        if not activity.delete_comment(pk):
            return _error("Commentaire introuvable.", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminReplyView(APIView):
    permission_classes = [has_permission("interactions", "reply_as_page")]

    def post(self, request, pk):
        try:
            comment = activity.add_page_reply(pk, request.user, request.data.get("body"))
        except activity.NotFound:
            return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
        except activity.InteractionError as exc:
            return _error(str(exc))
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class AdminCommentsSettingView(APIView):
    permission_classes = [has_permission("interactions", "toggle_comments")]

    def patch(self, request, pk):
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return _error("Indiquez true ou false.")
        if not activity.set_comments_enabled(pk, enabled):
            return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
        return Response({"comments_enabled": enabled})


# --- Share previews ----------------------------------------------------------

def share_preview(request, pk):
    """Public: what WhatsApp, Facebook and others read to draw a link preview, then sends people to the post."""
    post = posts.public_feed().filter(pk=pk).first()
    if post is None:
        raise Http404
    text = " ".join(post.body.split())
    description = text[:197] + "…" if len(text) > 200 else (text or "Nouvelle publication de GenZ")
    first = next((m for m in post.visible_media), None)
    image_name = (first.feed_name if first.kind == PostMedia.Kind.PHOTO else first.poster_name) if first else ""
    image = f"{settings.SITE_URL}{default_storage.url(image_name)}" if image_name else ""
    target = f"{settings.SITE_URL}/publication/{post.id}"
    html = format_html(
        '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        "<title>GenZ</title>"
        '<meta property="og:type" content="article">'
        '<meta property="og:site_name" content="GenZ – La génération qui dit non">'
        '<meta property="og:title" content="GenZ">'
        '<meta property="og:description" content="{}">'
        '<meta property="og:url" content="{}">'
        "{}"
        '<meta http-equiv="refresh" content="0; url={}">'
        '</head><body><a href="{}">Voir la publication</a></body></html>',
        description, target,
        format_html('<meta property="og:image" content="{}">', image) if image else "",
        target, target,
    )
    return HttpResponse(html)
