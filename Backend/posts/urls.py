from django.urls import path

from posts import api

urlpatterns = [
    path("posts/", api.PublicFeedView.as_view()),
    path("admin/posts/", api.AdminPostListView.as_view()),
    path("admin/posts/<int:pk>/", api.AdminPostDetailView.as_view()),
]
