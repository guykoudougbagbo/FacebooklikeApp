from django.urls import path

from messaging import api

urlpatterns = [
    path("messages/conversations/", api.ConversationListView.as_view()),
    path("messages/conversations/<int:pk>/", api.ConversationDetailView.as_view()),
    path("messages/conversations/<int:pk>/members/", api.MemberListView.as_view()),
    path("messages/conversations/<int:pk>/members/<int:user_id>/", api.MemberDetailView.as_view()),
    path("messages/conversations/<int:pk>/messages/", api.MessageListView.as_view()),
    path("messages/conversations/<int:pk>/read/", api.ReadView.as_view()),
    path("messages/messages/<int:pk>/", api.MessageDetailView.as_view()),
    path("messages/unread/", api.UnreadView.as_view()),
]
