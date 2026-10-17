from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from interactions.api import share_preview
from utils import dev_media

# Routes are listed in Documentation/endpoint-index.md; keep both in sync.
urlpatterns = [
    path("api/", include("accounts.urls")),
    path("api/", include("posts.urls")),
    path("api/", include("interactions.urls")),
    path("api/", include("messaging.urls")),
    path("p/<int:pk>/", share_preview),
]

if settings.DEBUG:
    # Development only: in production, photos and videos are served by the file storage, not Django.
    # dev_media answers byte-range requests, without which iPhones won't play videos.
    urlpatterns += static(settings.MEDIA_URL, view=dev_media.serve, document_root=settings.MEDIA_ROOT)
