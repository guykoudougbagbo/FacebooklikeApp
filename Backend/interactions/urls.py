from django.urls import path

from interactions import api

urlpatterns = [
    path("posts/<int:pk>/reaction/", api.ReactionView.as_view()),
    path("posts/<int:pk>/comments/", api.CommentListCreateView.as_view()),
    path("posts/<int:pk>/share/", api.ShareView.as_view()),
    path("page/", api.PageView.as_view()),
    path("page/follow/", api.FollowView.as_view()),
    path("app/device/", api.AppDeviceView.as_view()),
    path("admin/comments/<int:pk>/", api.AdminCommentDeleteView.as_view()),
    path("admin/posts/<int:pk>/comments/", api.AdminReplyView.as_view()),
    path("admin/posts/<int:pk>/comments-enabled/", api.AdminCommentsSettingView.as_view()),
]
