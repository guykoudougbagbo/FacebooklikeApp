from rest_framework import generics, status
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from utils.api import NewestFirstPagination, has_permission
from utils.posts import photos, posts
from utils.posts.serializers import AdminPostSerializer, PublicPostSerializer

NOT_FOUND = "Publication introuvable."
NOT_ALLOWED = "Vous ne pouvez pas modifier cette publication."


class FeedPagination(CursorPagination):
    ordering = "-published_at"


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


def _upload_parts(request):
    data = request.data
    body = data.get("body", "")
    uploads = request.FILES.getlist("photos")
    raw_ids = data.getlist("remove_photo_ids") if hasattr(data, "getlist") else data.get("remove_photo_ids", [])
    try:
        remove_ids = [int(i) for i in raw_ids]
    except (TypeError, ValueError):
        remove_ids = None
    return body, uploads, remove_ids


class PublicFeedView(generics.ListAPIView):
    # Public: visitors read the page without an account.
    permission_classes = [AllowAny]
    serializer_class = PublicPostSerializer
    pagination_class = FeedPagination

    def get_queryset(self):
        return posts.public_feed()


class AdminPostListView(generics.ListAPIView):
    serializer_class = AdminPostSerializer
    pagination_class = NewestFirstPagination

    def get_permissions(self):
        codename = "create_post" if self.request.method == "POST" else "view_post_details"
        return [has_permission("posts", codename)()]

    def get_queryset(self):
        return posts.admin_feed()

    def post(self, request):
        body, uploads, _ = _upload_parts(request)
        try:
            post = posts.create_post(request.user, body, uploads)
        except (posts.PostError, photos.PhotoError) as exc:
            return _error(str(exc))
        return Response(self._one(post.id), status=status.HTTP_201_CREATED)

    def _one(self, post_id):
        return AdminPostSerializer(posts.admin_feed().get(pk=post_id), context={"request": self.request}).data


class AdminPostDetailView(APIView):
    def get_permissions(self):
        # Whose post it is (and the owner's delete-any right) is checked in utils.posts.posts.
        codename = {"PATCH": "edit_own_post", "DELETE": "delete_own_post"}.get(self.request.method, "view_post_details")
        return [has_permission("posts", codename)()]

    def get(self, request, pk):
        post = posts.admin_feed().filter(pk=pk).first()
        if post is None:
            return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
        return Response(AdminPostSerializer(post, context={"request": request}).data)

    def patch(self, request, pk):
        body, uploads, remove_ids = _upload_parts(request)
        if remove_ids is None:
            return _error("Liste de photos à retirer invalide.")
        try:
            posts.edit_post(pk, request.user, body, uploads, remove_ids)
        except posts.PostNotFound:
            return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
        except PermissionError:
            return _error(NOT_ALLOWED, status.HTTP_403_FORBIDDEN)
        except (posts.PostError, photos.PhotoError) as exc:
            return _error(str(exc))
        return self.get(request, pk)

    def delete(self, request, pk):
        try:
            posts.delete_post(pk, request.user)
        except posts.PostNotFound:
            return _error(NOT_FOUND, status.HTTP_404_NOT_FOUND)
        except PermissionError:
            return _error(NOT_ALLOWED, status.HTTP_403_FORBIDDEN)
        return Response(status=status.HTTP_204_NO_CONTENT)
