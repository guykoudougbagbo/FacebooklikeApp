from django.urls import include, path

# Routes are listed in Documentation/endpoint-index.md; keep both in sync.
urlpatterns = [
    path("api/", include("accounts.urls")),
]
