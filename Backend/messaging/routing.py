from django.urls import path

from messaging.consumers import MessagingConsumer

websocket_urlpatterns = [
    path("ws/messages/", MessagingConsumer.as_asgi()),
]
