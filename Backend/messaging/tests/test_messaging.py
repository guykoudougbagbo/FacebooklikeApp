import asyncio
from unittest import mock

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db import connection
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext

from accounts.models import AppLogin
from accounts.tests.helpers import LOCMEM_CACHE, PASSWORD, AccountsTestCase, SecureAPIClient
from messaging.api import MessageThrottle
from messaging.models import Conversation, Membership, Message
from utils.accounts import admins, app_logins, sessions
from utils.messaging import conversations, notifications

IN_MEMORY = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


async def _drain(layer, channel):
    """Everything waiting on a channel right now (the layer's receive waits, so give up after a moment)."""
    events = []
    while True:
        try:
            message = await asyncio.wait_for(layer.receive(channel), timeout=0.05)
        except TimeoutError:
            return events
        events.append(message["event"])
CONVERSATIONS = "/api/messages/conversations/"


NOTIFY_PHONES = "messaging.tasks.send_message_notifications.delay"


@override_settings(CHANNEL_LAYERS=IN_MEMORY)
class MessagingTestCase(AccountsTestCase):
    def setUp(self):
        super().setUp()
        # Never queue real notification jobs into the developer's Redis; tests that check it patch this again.
        self.enterContext(mock.patch(NOTIFY_PHONES))
        self.owner = self.make_owner()
        self.awa = self.make_admin("awa@example.com")
        self.koffi = self.make_admin("koffi@example.com")
        self.outsider = self.make_admin("outsider@example.com")

    def client_for(self, user):
        client = SecureAPIClient()
        client.force_login(user)
        return client

    def listen(self, *users):
        """Subscribes a fake connection per user to their live-event group; returns a reader."""
        layer = get_channel_layer()
        channels = {}
        for user in users:
            name = async_to_sync(layer.new_channel)()
            async_to_sync(layer.group_add)(f"user.{user.pk}", name)
            channels[user.pk] = name

        def read(user):
            return async_to_sync(_drain)(layer, channels[user.pk])

        return read

    def send(self, user, conversation_id, body="Salut"):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client_for(user).post(f"{CONVERSATIONS}{conversation_id}/messages/", {"body": body})

    def direct(self, a, b):
        with self.captureOnCommitCallbacks(execute=True):
            return conversations.start_direct(a, b.pk)


class DirectConversationTest(MessagingTestCase):
    def test_one_conversation_per_pair_named_after_the_other_person(self):
        response = self.client_for(self.awa).post(CONVERSATIONS, {"kind": "direct", "user_id": self.koffi.pk})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], "koffi")
        again = self.client_for(self.koffi).post(CONVERSATIONS, {"kind": "direct", "user_id": self.awa.pk}).json()
        self.assertEqual(again["id"], response.json()["id"])
        self.assertEqual(again["title"], "awa")
        self.assertEqual(Conversation.objects.count(), 1)

    def test_cannot_message_yourself_removed_admins_or_unknown_people(self):
        awa = self.client_for(self.awa)
        self.assertEqual(awa.post(CONVERSATIONS, {"kind": "direct", "user_id": self.awa.pk}).status_code, 400)
        admins.remove_admin(self.koffi.pk, self.owner)
        self.assertEqual(awa.post(CONVERSATIONS, {"kind": "direct", "user_id": self.koffi.pk}).status_code, 400)
        self.assertEqual(awa.post(CONVERSATIONS, {"kind": "direct", "user_id": 999999}).status_code, 400)
        self.assertEqual(awa.post(CONVERSATIONS, {"kind": "direct", "user_id": "abc"}).status_code, 400)


class PrivacyTest(MessagingTestCase):
    def test_only_members_can_see_or_touch_a_conversation(self):
        cid = self.direct(self.awa, self.koffi)
        message_id = self.send(self.awa, cid).json()["id"]
        outsider, visitor = self.client_for(self.outsider), SecureAPIClient()
        for method, url, data in (
            ("get", f"{CONVERSATIONS}{cid}/", None),
            ("get", f"{CONVERSATIONS}{cid}/messages/", None),
            ("post", f"{CONVERSATIONS}{cid}/messages/", {"body": "intrus"}),
            ("post", f"{CONVERSATIONS}{cid}/read/", {"message_id": message_id}),
            ("delete", f"/api/messages/messages/{message_id}/", None),
        ):
            with self.subTest(method=method, url=url):
                self.assertEqual(getattr(outsider, method)(url, data).status_code, 404)
                self.assertEqual(getattr(visitor, method)(url, data).status_code, 403)
        self.assertEqual(outsider.get(CONVERSATIONS).json()["results"], [])
        self.assertEqual(Message.objects.filter(body="intrus").count(), 0)

    def test_events_reach_only_the_members(self):
        cid = self.direct(self.awa, self.koffi)
        read = self.listen(self.awa, self.koffi, self.outsider)
        self.send(self.awa, cid, "Bonjour Koffi")
        self.assertEqual([e["message"]["body"] for e in read(self.koffi)], ["Bonjour Koffi"])
        self.assertEqual(len(read(self.awa)), 1)
        self.assertEqual(read(self.outsider), [])


class MessageTest(MessagingTestCase):
    def setUp(self):
        super().setUp()
        self.cid = self.direct(self.awa, self.koffi)

    def test_send_unread_and_read(self):
        self.assertEqual(self.send(self.awa, self.cid, "  Coucou  ").json()["body"], "Coucou")
        koffi, awa = self.client_for(self.koffi), self.client_for(self.awa)
        self.assertEqual(koffi.get("/api/messages/unread/").json(), {"count": 1})
        self.assertEqual(awa.get("/api/messages/unread/").json(), {"count": 0})
        latest = koffi.get(f"{CONVERSATIONS}{self.cid}/messages/").json()["results"][0]
        read = self.listen(self.awa)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(koffi.post(f"{CONVERSATIONS}{self.cid}/read/", {"message_id": latest["id"]}).status_code, 204)
        self.assertEqual(koffi.get("/api/messages/unread/").json(), {"count": 0})
        self.assertEqual(read(self.awa)[0], {"type": "read", "conversation": self.cid, "user_id": self.koffi.pk, "message_id": latest["id"]})
        state = awa.get(f"{CONVERSATIONS}{self.cid}/").json()["read_state"]
        self.assertEqual(state[str(self.koffi.pk)], latest["id"])

    def test_reading_never_goes_backwards(self):
        first = self.send(self.awa, self.cid, "1").json()["id"]
        second = self.send(self.awa, self.cid, "2").json()["id"]
        koffi = self.client_for(self.koffi)
        koffi.post(f"{CONVERSATIONS}{self.cid}/read/", {"message_id": second})
        koffi.post(f"{CONVERSATIONS}{self.cid}/read/", {"message_id": first})
        self.assertEqual(Membership.objects.get(user=self.koffi).last_read_message_id, second)

    def test_empty_long_and_too_frequent_messages_are_refused(self):
        self.assertEqual(self.send(self.awa, self.cid, "   ").status_code, 400)
        with override_settings(MESSAGE_MAX_LENGTH=5):
            self.assertIn("dépasse", self.send(self.awa, self.cid, "trop long").json()["detail"])
        cache.clear()  # The two refused messages above already counted towards the limit.
        with mock.patch.object(MessageThrottle, "rate", "2/m", create=True):
            codes = [self.send(self.awa, self.cid, "x").status_code for _ in range(3)]
        self.assertEqual(codes, [201, 201, 429])

    def test_only_the_writer_deletes_a_message_and_its_text_is_erased(self):
        message_id = self.send(self.awa, self.cid, "Oups").json()["id"]
        self.assertEqual(self.client_for(self.koffi).delete(f"/api/messages/messages/{message_id}/").status_code, 403)
        read = self.listen(self.koffi)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client_for(self.awa).delete(f"/api/messages/messages/{message_id}/").status_code, 204)
        row = self.client_for(self.koffi).get(f"{CONVERSATIONS}{self.cid}/messages/").json()["results"][0]
        self.assertEqual((row["deleted"], row["body"]), (True, ""))
        self.assertEqual(read(self.koffi)[0]["type"], "message_deleted")
        created_event = Message.objects.get(conversation_id=self.cid, kind="event").id
        self.assertEqual(self.client_for(self.awa).delete(f"/api/messages/messages/{created_event}/").status_code, 404)


class GroupTest(MessagingTestCase):
    def create(self, by=None, members=None, title="Équipe com"):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client_for(by or self.awa).post(
                CONVERSATIONS, {"kind": "group", "title": title, "member_ids": [m.pk for m in (members or [self.koffi])]},
                format="json",
            )

    def test_create_needs_a_name_and_another_member_within_the_limit(self):
        self.assertEqual(self.create(title=" ").status_code, 400)
        self.assertEqual(self.create(members=[self.awa]).status_code, 400)
        with override_settings(GROUP_MAX_MEMBERS=2):
            self.assertEqual(self.create(members=[self.koffi, self.outsider]).status_code, 400)
        group = self.create().json()
        self.assertEqual((group["title"], group["manager_id"]), ("Équipe com", self.awa.pk))
        self.assertEqual([m["name"] for m in group["members"]], ["awa", "koffi"])

    def test_only_the_manager_renames_adds_and_removes(self):
        cid = self.create().json()["id"]
        koffi, awa = self.client_for(self.koffi), self.client_for(self.awa)
        self.assertEqual(koffi.patch(f"{CONVERSATIONS}{cid}/", {"title": "Piraté"}).status_code, 403)
        self.assertEqual(koffi.post(f"{CONVERSATIONS}{cid}/members/", {"user_id": self.outsider.pk}).status_code, 403)
        self.assertEqual(koffi.delete(f"{CONVERSATIONS}{cid}/members/{self.awa.pk}/").status_code, 403)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(awa.patch(f"{CONVERSATIONS}{cid}/", {"title": "Équipe"}).json()["title"], "Équipe")
            self.assertEqual(awa.post(f"{CONVERSATIONS}{cid}/members/", {"user_id": self.outsider.pk}).status_code, 201)
        self.assertEqual(awa.post(f"{CONVERSATIONS}{cid}/members/", {"user_id": self.outsider.pk}).status_code, 400)
        read = self.listen(self.outsider)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(awa.delete(f"{CONVERSATIONS}{cid}/members/{self.outsider.pk}/").status_code, 204)
        self.assertIn({"type": "removed", "conversation": cid}, read(self.outsider))
        self.assertEqual(self.client_for(self.outsider).get(f"{CONVERSATIONS}{cid}/").status_code, 404)
        events = list(Message.objects.filter(conversation_id=cid, kind="event").values_list("event", flat=True))
        self.assertEqual(events, ["created", "renamed", "added", "removed"])

    def test_when_the_manager_leaves_the_longest_member_takes_over(self):
        cid = self.create(members=[self.koffi, self.outsider]).json()["id"]
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client_for(self.awa).delete(f"{CONVERSATIONS}{cid}/members/{self.awa.pk}/").status_code, 204)
        self.assertEqual(Conversation.objects.get(pk=cid).manager_id, self.koffi.pk)
        self.assertEqual(Message.objects.filter(conversation_id=cid).last().event, "left")

    def test_the_last_member_leaving_deletes_the_group(self):
        cid = self.create().json()["id"]
        conversations.remove_member(cid, self.koffi, self.koffi.pk)
        conversations.remove_member(cid, self.awa, self.awa.pk)
        self.assertFalse(Conversation.objects.filter(pk=cid).exists())

    def test_a_removed_admin_is_taken_out_of_every_group(self):
        cid = self.create(members=[self.koffi, self.outsider]).json()["id"]
        with self.captureOnCommitCallbacks(execute=True):
            self.client_for(self.owner).post(f"/api/admin/admins/{self.koffi.pk}/remove/")
        self.assertFalse(Membership.objects.filter(conversation_id=cid, user=self.koffi).exists())
        last = Message.objects.filter(conversation_id=cid).last()
        self.assertEqual((last.event, last.target_user_id, last.sender_id), ("removed", self.koffi.pk, self.owner.pk))

    def test_one_on_one_conversations_cannot_be_left(self):
        cid = self.direct(self.awa, self.koffi)
        self.assertEqual(self.client_for(self.awa).delete(f"{CONVERSATIONS}{cid}/members/{self.awa.pk}/").status_code, 400)


class ConversationListTest(MessagingTestCase):
    def test_latest_activity_first_with_preview_and_unread(self):
        first = self.direct(self.awa, self.koffi)
        second = self.direct(self.awa, self.outsider)
        self.send(self.koffi, first, "Plus récent")
        rows = self.client_for(self.awa).get(CONVERSATIONS).json()["results"]
        self.assertEqual([r["id"] for r in rows], [first, second])
        self.assertEqual((rows[0]["last_message"]["body"], rows[0]["unread"]), ("Plus récent", True))

    def test_query_count_does_not_grow_with_conversations(self):
        awa = self.client_for(self.awa)
        self.direct(self.awa, self.koffi)

        def count():
            with CaptureQueriesContext(connection) as queries:
                awa.get(CONVERSATIONS)
            return len(queries)

        before = count()
        for i in range(4):
            other = self.make_admin(f"more{i}@example.com")
            self.send(self.awa, self.direct(self.awa, other), "x")
        self.assertEqual(count(), before)

    def test_every_admin_role_may_use_messaging(self):
        for user in (self.owner, self.awa):
            self.assertTrue(user.has_perm("messaging.use_messaging"))


# Channels' database helper closes connections around each call, which breaks the single transaction
# a normal TestCase runs in, so live-connection tests use TransactionTestCase (data really saved, then wiped).
@override_settings(CHANNEL_LAYERS=IN_MEMORY, CACHES=LOCMEM_CACHE,
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LiveConnectionTest(TransactionTestCase):
    def setUp(self):
        self.enterContext(mock.patch(NOTIFY_PHONES))

        def admin(email):
            user = get_user_model().objects.create_user(email, email.split("@")[0], PASSWORD)
            user.groups.add(Group.objects.get(name="admin"))
            return user

        self.awa, self.koffi = admin("awa@example.com"), admin("koffi@example.com")

    def client_for(self, user):
        client = SecureAPIClient()
        client.force_login(user)
        return client

    def direct(self, a, b):
        return conversations.start_direct(a, b.pk)

    def send(self, user, conversation_id, body):
        return self.client_for(user).post(f"{CONVERSATIONS}{conversation_id}/messages/", {"body": body})

    async def connect(self, user=None, origin=b"http://localhost"):
        from config.asgi import application

        headers = [(b"origin", origin)]
        if user is not None:
            client = await database_sync_to_async(self.client_for)(user)
            headers.append((b"cookie", f"sessionid={client.cookies['sessionid'].value}".encode()))
        communicator = WebsocketCommunicator(application, "/ws/messages/", headers=headers)
        connected, code = await communicator.connect()
        return communicator, connected, code

    async def test_visitors_and_other_sites_are_refused(self):
        communicator, connected, code = await self.connect()
        self.assertEqual((connected, code), (False, 4403))
        communicator, connected, _ = await self.connect(self.awa, origin=b"https://evil.example")
        self.assertFalse(connected)

    async def test_members_receive_new_messages_live(self):
        cid = await database_sync_to_async(self.direct)(self.awa, self.koffi)
        communicator, connected, _ = await self.connect(self.koffi)
        self.assertTrue(connected)
        await database_sync_to_async(self.send)(self.awa, cid, "En direct")
        event = await communicator.receive_json_from()
        self.assertEqual((event["type"], event["message"]["body"]), ("message", "En direct"))
        await communicator.disconnect()

    async def test_an_admin_logged_out_everywhere_is_disconnected_at_the_next_event(self):
        cid = await database_sync_to_async(self.direct)(self.awa, self.koffi)
        communicator, connected, _ = await self.connect(self.koffi)
        self.assertTrue(connected)
        await database_sync_to_async(sessions.end_all_sessions)(self.koffi)
        await database_sync_to_async(self.send)(self.awa, cid, "Tu ne le verras pas")
        closed = await communicator.receive_output()
        self.assertEqual((closed["type"], closed.get("code")), ("websocket.close", 4401))

    async def app_connect(self, key, origin=b"http://localhost"):
        from config.asgi import application

        headers = [(b"origin", origin), (b"authorization", f"Bearer {key}".encode())]
        communicator = WebsocketCommunicator(application, "/ws/messages/", headers=headers)
        connected, code = await communicator.connect()
        return communicator, connected, code

    async def test_the_app_connects_with_its_login_key_until_that_login_ends(self):
        cid = await database_sync_to_async(self.direct)(self.awa, self.koffi)
        key = await database_sync_to_async(app_logins.create)(self.koffi)
        communicator, connected, _ = await self.app_connect(key)
        self.assertTrue(connected)
        await database_sync_to_async(self.send)(self.awa, cid, "Sur le téléphone")
        self.assertEqual((await communicator.receive_json_from())["message"]["body"], "Sur le téléphone")
        await database_sync_to_async(lambda: AppLogin.objects.filter(user=self.koffi).delete())()
        await database_sync_to_async(self.send)(self.awa, cid, "Plus maintenant")
        closed = await communicator.receive_output()
        self.assertEqual((closed["type"], closed.get("code")), ("websocket.close", 4401))

    async def test_a_wrong_app_key_is_refused(self):
        communicator, connected, code = await self.app_connect("nope")
        self.assertEqual((connected, code), (False, 4403))


EXPO = "utils.expo_push.requests.post"
TOKENS = {"koffi": "ExponentPushToken[koffi]", "outsider": "ExponentPushToken[outsider]", "awa": "ExponentPushToken[awa]"}


def expo_ok(url, json, **kwargs):
    return mock.Mock(status_code=200, text="", json=mock.Mock(return_value={
        "data": [{"status": "ok", "id": f"ticket-{m['to']}"} for m in json]}))


class MessageNotificationTest(MessagingTestCase):
    def phone(self, user, name):
        key = app_logins.create(user)
        app_logins.set_push_token(app_logins.find(key), TOKENS[name])
        return key

    def test_sending_a_message_queues_its_notification_after_saving(self):
        cid = conversations.start_direct(self.awa, self.koffi.pk)
        with mock.patch(NOTIFY_PHONES) as notify, self.captureOnCommitCallbacks(execute=True):
            message = conversations.send_message(cid, self.awa, "Bonjour")
        notify.assert_called_once_with(message.id)

    def test_other_members_phones_hear_who_wrote_but_not_what(self):
        cid = conversations.create_group(self.awa, "Équipe", [self.koffi.pk, self.outsider.pk])
        self.phone(self.awa, "awa")
        self.phone(self.koffi, "koffi")
        self.phone(self.outsider, "outsider")
        admins.remove_admin(self.outsider.pk, self.owner)
        message = conversations.send_message(cid, self.awa, "Réunion secrète à 18 h")
        with mock.patch(EXPO, side_effect=expo_ok) as expo, \
                mock.patch("messaging.tasks.check_message_receipts.apply_async") as receipts:
            self.assertEqual(notifications.send(message.id), {"sent": 1, "gone": 0})
        sent = expo.call_args.kwargs["json"]
        self.assertEqual([m["to"] for m in sent], [TOKENS["koffi"]])
        self.assertEqual(sent[0]["body"], f"Nouveau message de {self.awa.display_name}")
        self.assertEqual(sent[0]["data"], {"url": f"/admin/messages/{cid}"})
        self.assertNotIn("secrète", str(sent))
        receipts.assert_called_once()

    def test_phones_that_logged_out_hear_nothing(self):
        cid = conversations.start_direct(self.awa, self.koffi.pk)
        key = self.phone(self.koffi, "koffi")
        app_logins.end(app_logins.find(key))
        message = conversations.send_message(cid, self.awa, "Bonjour")
        with mock.patch(EXPO) as expo:
            self.assertEqual(notifications.send(message.id), {"sent": 0, "gone": 0})
        expo.assert_not_called()

    def test_uninstalled_apps_are_only_logged_until_pruning_is_switched_on(self):
        cid = conversations.start_direct(self.awa, self.koffi.pk)
        self.phone(self.koffi, "koffi")
        message = conversations.send_message(cid, self.awa, "Bonjour")
        gone = mock.Mock(status_code=200, text="", json=mock.Mock(return_value={
            "data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]}))
        with mock.patch(EXPO, return_value=gone), self.assertLogs("utils.accounts.app_logins", "WARNING") as logs:
            self.assertEqual(notifications.send(message.id)["gone"], 1)
        self.assertIn("log-only", logs.output[0])
        self.assertTrue(AppLogin.objects.filter(push_token=TOKENS["koffi"]).exists())
        with override_settings(PUSH_PRUNE_APPLY=True), mock.patch(EXPO, return_value=gone), \
                self.assertLogs("utils.accounts.app_logins", "WARNING"):
            notifications.send(message.id)
        self.assertFalse(AppLogin.objects.filter(push_token=TOKENS["koffi"]).exists())


class RedisTimeoutCheckTest(SimpleTestCase):
    def test_idle_live_connections_cannot_be_broken_by_a_short_read_timeout(self):
        from utils.messaging.checks import socket_timeout_outlasts_waits

        with override_settings(CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS=5):
            self.assertEqual([e.id for e in socket_timeout_outlasts_waits(None)], ["messaging.E001"])
        with override_settings(CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS=15):
            self.assertEqual(socket_timeout_outlasts_waits(None), [])

    def test_the_layer_gets_the_read_timeout(self):
        from django.conf import settings

        host = settings.CHANNEL_LAYERS["default"]["CONFIG"]["hosts"][0]
        self.assertEqual(host["socket_timeout"], settings.CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS)

