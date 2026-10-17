from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from interactions.api import share_preview

# Routes are listed in Documentation/endpoint-index.md; keep both in sync.
urlpatterns = [
    path("api/", include("accounts.urls")),
    path("api/", include("posts.urls")),
    path("api/", include("interactions.urls")),
    path("p/<int:pk>/", share_preview),
]

if settings.DEBUG:
    # Development only: in production, web photos are served by the file storage, not Django.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
