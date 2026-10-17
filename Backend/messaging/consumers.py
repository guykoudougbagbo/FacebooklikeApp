from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from utils.messaging import realtime

# Closing codes the page understands: not allowed, and session ended.
NOT_ALLOWED = 4403
SESSION_ENDED = 4401


class MessagingConsumer(AsyncJsonWebsocketConsumer):
    """One live connection per open admin page. It only receives; sending goes through the normal routes."""

    async def connect(self):
        user = self.scope.get("user")
        if not await database_sync_to_async(realtime.can_connect)(user):
            await self.close(code=NOT_ALLOWED)
            return
        self.user_id, self.epoch = user.pk, user.session_epoch
        self.group = realtime.group_name(user.pk)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        pass

    async def deliver(self, message):
        if not await database_sync_to_async(realtime.still_allowed)(self.user_id, self.epoch):
            await self.close(code=SESSION_ENDED)
            return
        await self.send_json(message["event"])
