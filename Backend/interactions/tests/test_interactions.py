import json
from unittest import mock

from django.conf import settings
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from pywebpush import WebPushException

from accounts.tests.helpers import SecureAPIClient
from interactions.models import Comment, Device, Follower, MobilePushToken, PushSubscription, Reaction
from interactions.tasks import send_app_notifications
from posts.models import Post
from posts.tests.helpers import PostsTestCase, as_items, make_photo
from utils.interactions import follows
from utils.interactions.devices import hash_secret
from utils.interactions.throttles import AppDeviceThrottle, CommentDeviceThrottle
from utils.posts import posts

NOTIFY = "interactions.tasks.send_post_notifications.delay"
APP_NOTIFY = "interactions.tasks.send_app_notifications.delay"
RECEIPTS = "interactions.tasks.check_app_receipts.apply_async"
EXPO = "utils.interactions.follows.requests.post"
APP_TOKEN = "ExponentPushToken[abcDEF123_-]"
SUBSCRIPTION = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "key", "auth": "auth"}}


class InteractionsTestCase(PostsTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_admin()
        self.post = posts.create_post(self.admin, "Bonjour <b>tout le monde</b>", [])
        self.visitor = SecureAPIClient()

    def url(self, suffix, post=None):
        return f"/api/posts/{(post or self.post).id}/{suffix}"


class DeviceTest(InteractionsTestCase):
    def test_first_interaction_sets_a_protected_cookie_reused_afterwards(self):
        response = self.visitor.post(self.url("reaction/"), {"kind": "like"})
        cookie = response.cookies["device"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertNotEqual(Device.objects.get().token_hash, cookie.value)
        self.visitor.post(self.url("reaction/"), {"kind": "love"})
        self.assertEqual(Device.objects.count(), 1)


class ReactionTest(InteractionsTestCase):
    def test_one_reaction_per_device_that_can_change_or_be_removed(self):
        self.assertEqual(self.visitor.post(self.url("reaction/"), {"kind": "like"}).json()["reactions"], {"like": 1})
        summary = self.visitor.post(self.url("reaction/"), {"kind": "love"}).json()
        self.assertEqual((summary["reactions"], summary["my_reaction"]), ({"love": 1}, "love"))
        SecureAPIClient().post(self.url("reaction/"), {"kind": "love"})
        self.assertEqual(self.visitor.delete(self.url("reaction/")).json()["reactions"], {"love": 1})

    def test_unknown_reactions_and_unpublished_posts_are_refused(self):
        self.assertEqual(self.visitor.post(self.url("reaction/"), {"kind": "kiss"}).status_code, 400)
        with self.captureOnCommitCallbacks(execute=False):
            hidden = posts.create_post(self.admin, "", as_items(make_photo()))
        self.assertEqual(self.visitor.post(self.url("reaction/", hidden), {"kind": "like"}).status_code, 404)

    def test_feed_shows_counts_and_my_reaction_without_extra_queries_per_post(self):
        self.visitor.post(self.url("reaction/"), {"kind": "haha"})
        row = self.visitor.get("/api/posts/").json()["results"][0]
        self.assertEqual((row["interactions"]["reactions"], row["interactions"]["my_reaction"]), ({"haha": 1}, "haha"))
        self.assertIsNone(SecureAPIClient().get("/api/posts/").json()["results"][0]["interactions"]["my_reaction"])

        def count():
            with CaptureQueriesContext(connection) as queries:
                self.visitor.get("/api/posts/")
            return len(queries)

        before = count()
        for i in range(5):
            posts.create_post(self.admin, f"Post {i}", [])
        self.assertEqual(count(), before)


class CommentTest(InteractionsTestCase):
    def comment(self, client=None, **data):
        body = {"name": "  Awa   K. ", "body": "Bravo !", **data}
        return (client or self.visitor).post(self.url("comments/"), body)

    def test_visitor_comment_appears_at_once_oldest_first(self):
        self.assertEqual(self.comment().status_code, 201)
        self.comment(body="Deuxième")
        rows = self.visitor.get(self.url("comments/")).json()["results"]
        self.assertEqual([(r["name"], r["body"], r["is_page"]) for r in rows],
                         [("Awa K.", "Bravo !", False), ("Awa K.", "Deuxième", False)])
        self.assertEqual(self.visitor.get("/api/posts/").json()["results"][0]["interactions"]["comments"], 2)

    def test_bad_comments_are_refused(self):
        for data, message in (({"name": " "}, "votre nom"), ({"body": "  "}, "vide"),
                              ({"body": "x" * 1001}, "dépasse"), ({"name": "n" * 41}, "nom dépasse")):
            with self.subTest(message=message):
                response = self.comment(**data)
                self.assertEqual(response.status_code, 400)
                self.assertIn(message, response.json()["detail"])
        self.assertEqual(Comment.objects.count(), 0)

    def test_robot_trap_field_blocks_the_comment(self):
        self.assertEqual(self.comment(website="http://spam.example").status_code, 400)
        self.assertEqual(Comment.objects.count(), 0)

    def test_repeated_comments_from_one_device_are_limited(self):
        # The first comment has no device cookie yet, so only the per-address limit counts it.
        with mock.patch.object(CommentDeviceThrottle, "rate", "2/h", create=True):
            codes = [self.comment().status_code for _ in range(4)]
        self.assertEqual(codes, [201, 201, 201, 429])

    def test_admins_reply_as_the_page_delete_comments_and_turn_comments_off(self):
        admin_client = SecureAPIClient()
        admin_client.force_login(self.admin)
        reply = admin_client.post(f"/api/admin/posts/{self.post.id}/comments/", {"body": "Merci !"}).json()
        self.assertEqual((reply["name"], reply["is_page"]), ("GenZ", True))
        self.assertNotIn(self.admin.display_name, json.dumps(self.visitor.get(self.url("comments/")).json()))

        comment_id = self.comment().json()["id"]
        self.assertEqual(self.visitor.delete(f"/api/admin/comments/{comment_id}/").status_code, 403)
        self.assertEqual(admin_client.delete(f"/api/admin/comments/{comment_id}/").status_code, 204)

        setting = f"/api/admin/posts/{self.post.id}/comments-enabled/"
        self.assertEqual(self.visitor.patch(setting, {"enabled": False}, format="json").status_code, 403)
        self.assertEqual(admin_client.patch(setting, {"enabled": "no"}, format="json").status_code, 400)
        self.assertEqual(admin_client.patch(setting, {"enabled": False}, format="json").status_code, 200)
        self.assertIn("désactivés", self.comment().json()["detail"])
        self.assertFalse(self.visitor.get(f"/api/posts/{self.post.id}/").json()["comments_enabled"])
        self.assertEqual(len(self.visitor.get(self.url("comments/")).json()["results"]), 1)


class ShareTest(InteractionsTestCase):
    def test_a_device_counts_once(self):
        self.visitor.post(self.url("share/"))
        self.assertEqual(self.visitor.post(self.url("share/")).json()["shares"], 1)
        self.assertEqual(SecureAPIClient().post(self.url("share/")).json()["shares"], 2)

    @override_settings(SITE_URL="https://genz.example")
    def test_share_link_preview_is_escaped_and_points_to_the_post(self):
        with self.captureOnCommitCallbacks(execute=True):
            post = posts.create_post(self.admin, '<script>alert("x")</script> Notre message', as_items(make_photo()))
            posts.process_post_media(post.id)
        html = self.visitor.get(f"/p/{post.id}/").content.decode()
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;", html)
        self.assertIn(f'content="https://genz.example/publication/{post.id}"', html)
        self.assertIn('property="og:image" content="https://genz.example/media/posts/photos/', html)
        self.assertEqual(self.visitor.get("/p/999999/").status_code, 404)


class FollowTest(InteractionsTestCase):
    def test_follow_and_unfollow(self):
        page = self.visitor.get("/api/page/").json()
        self.assertEqual((page["followers"], page["following"]), (0, False))
        self.assertTrue(page["push_public_key"])
        followed = self.visitor.post("/api/page/follow/", {"subscription": SUBSCRIPTION}, format="json").json()
        self.assertEqual((followed["followers"], followed["following"]), (1, True))
        self.assertEqual(self.visitor.delete("/api/page/follow/").json()["following"], False)
        self.assertEqual(PushSubscription.objects.count(), 0)

    def test_only_real_push_services_are_accepted(self):
        for endpoint in ("https://evil.example/push", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x"):
            bad = {**SUBSCRIPTION, "endpoint": endpoint}
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.visitor.post("/api/page/follow/", {"subscription": bad}, format="json").status_code, 400)
        self.assertEqual(self.visitor.post("/api/page/follow/", {"subscription": {"endpoint": SUBSCRIPTION["endpoint"]}},
                                           format="json").status_code, 400)
        self.assertEqual(Follower.objects.count(), 0)


class NotificationTest(InteractionsTestCase):
    def follow(self, endpoint):
        follows.follow(Device.objects.create(token_hash=endpoint[-64:].rjust(64, "0")),
                       {**SUBSCRIPTION, "endpoint": endpoint})

    def test_followers_hear_once_when_a_post_becomes_visible(self):
        with mock.patch(NOTIFY) as notify, self.captureOnCommitCallbacks(execute=True):
            text = posts.create_post(self.admin, "Texte", [])
        notify.assert_called_once_with(text.id, 0)
        with mock.patch(NOTIFY) as notify, self.captureOnCommitCallbacks(execute=True):
            media = posts.create_post(self.admin, "", as_items(make_photo()))
        notify.assert_not_called()
        with mock.patch(NOTIFY) as notify, self.captureOnCommitCallbacks(execute=True):
            posts.process_post_media(media.id)
        notify.assert_called_once_with(media.id, 0)

    def test_sends_to_each_follower_in_batches(self):
        self.follow("https://fcm.googleapis.com/a")
        self.follow("https://updates.push.services.mozilla.com/b")
        with override_settings(PUSH_BATCH_SIZE=1), mock.patch("utils.interactions.follows.webpush") as push, \
                mock.patch(NOTIFY) as next_batch:
            result = follows.send_post_notifications(self.post.id)
        self.assertEqual(result, {"sent": 1, "gone": 0})
        payload = json.loads(push.call_args.kwargs["data"])
        self.assertEqual(payload, {"title": "GenZ", "body": "Bonjour <b>tout le monde</b>", "url": f"/publication/{self.post.id}"})
        first = PushSubscription.objects.order_by("id").first()
        next_batch.assert_called_once_with(self.post.id, first.id)

    def test_gone_subscriptions_are_only_logged_until_pruning_is_switched_on(self):
        self.follow("https://fcm.googleapis.com/a")
        gone = WebPushException("Gone", response=mock.Mock(status_code=410))
        with mock.patch("utils.interactions.follows.webpush", side_effect=gone), \
                self.assertLogs("utils.interactions.follows", "WARNING") as logs:
            self.assertEqual(follows.send_post_notifications(self.post.id)["gone"], 1)
        self.assertIn("log-only", logs.output[0])
        self.assertEqual(PushSubscription.objects.count(), 1)
        with override_settings(PUSH_PRUNE_APPLY=True), self.assertLogs("utils.interactions.follows", "WARNING"), \
                mock.patch("utils.interactions.follows.webpush", side_effect=gone):
            follows.send_post_notifications(self.post.id)
        self.assertEqual(PushSubscription.objects.count(), 0)

    def test_unpublished_posts_send_nothing(self):
        Post.objects.filter(pk=self.post.id).update(status=Post.Status.FAILED)
        with mock.patch("utils.interactions.follows.webpush") as push:
            follows.send_post_notifications(self.post.id)
        push.assert_not_called()


def expo_answer(status=200, data=None):
    return mock.Mock(status_code=status, text="", json=mock.Mock(return_value={"data": data}))


def ok_tickets(url, json, **kwargs):
    return expo_answer(data=[{"status": "ok", "id": f"ticket-{m['to']}"} for m in json])


class AppDeviceTest(InteractionsTestCase):
    def setUp(self):
        super().setUp()
        self.app = SecureAPIClient(enforce_csrf_checks=True)

    def register(self):
        response = self.app.post("/api/app/device/")
        self.assertEqual(response.status_code, 201)
        return response.json()["device_key"]

    def test_the_app_registers_once_then_uses_its_key_without_cookie_or_csrf_token(self):
        key = self.register()
        self.assertNotEqual(Device.objects.get().token_hash, key)
        response = self.app.post(self.url("reaction/"), {"kind": "like"}, HTTP_X_DEVICE_KEY=key)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("device", response.cookies)
        self.assertEqual(Device.objects.count(), 1)
        feed = self.app.get("/api/posts/", HTTP_X_DEVICE_KEY=key).json()["results"]
        self.assertEqual(feed[0]["interactions"]["my_reaction"], "like")

    def test_unknown_keys_are_refused_and_create_nothing(self):
        response = self.app.post(self.url("reaction/"), {"kind": "like"}, HTTP_X_DEVICE_KEY="inconnue")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(Device.objects.count(), 0)

    def test_requests_without_the_key_still_need_the_csrf_token(self):
        self.assertEqual(self.app.post(self.url("reaction/"), {"kind": "like"}).status_code, 403)
        self.assertEqual(self.app.post("/api/page/follow/", {"expo_token": APP_TOKEN}, format="json").status_code, 403)
        self.assertEqual(Reaction.objects.count(), 0)

    def test_new_keys_are_limited_per_address(self):
        with mock.patch.object(AppDeviceThrottle, "rate", "2/h", create=True):
            self.register()
            self.register()
            self.assertEqual(self.app.post("/api/app/device/").status_code, 429)

    def test_comment_limit_counts_per_app_device_too(self):
        key = self.register()
        with mock.patch.object(CommentDeviceThrottle, "rate", "1/h", create=True):
            body = {"name": "Awa", "body": "Bravo"}
            self.assertEqual(self.app.post(self.url("comments/"), body, HTTP_X_DEVICE_KEY=key).status_code, 201)
            self.assertEqual(self.app.post(self.url("comments/"), body, HTTP_X_DEVICE_KEY=key).status_code, 429)


class AppFollowTest(InteractionsTestCase):
    def setUp(self):
        super().setUp()
        self.app = SecureAPIClient()
        self.key = self.app.post("/api/app/device/").json()["device_key"]

    def follow(self, token):
        return self.app.post("/api/page/follow/", {"expo_token": token}, format="json", HTTP_X_DEVICE_KEY=self.key)

    def test_the_app_follows_with_its_push_token(self):
        followed = self.follow(APP_TOKEN).json()
        self.assertEqual((followed["followers"], followed["following"]), (1, True))
        self.assertEqual(MobilePushToken.objects.get().token, APP_TOKEN)
        self.assertFalse(self.app.delete("/api/page/follow/", HTTP_X_DEVICE_KEY=self.key).json()["following"])
        self.assertEqual(MobilePushToken.objects.count(), 0)

    def test_a_token_moves_to_whoever_followed_with_it_last(self):
        self.follow(APP_TOKEN)
        other = self.app.post("/api/app/device/").json()["device_key"]
        self.app.post("/api/page/follow/", {"expo_token": APP_TOKEN}, format="json", HTTP_X_DEVICE_KEY=other)
        self.assertEqual(MobilePushToken.objects.count(), 1)
        self.assertEqual(MobilePushToken.objects.get().follower.device.token_hash, hash_secret(other))

    def test_only_expo_tokens_are_accepted(self):
        for bad in ("https://exp.host/x", "ExponentPushToken[]", "ExponentPushToken[a b]", 42,
                    "ExponentPushToken[" + "a" * 200 + "]", "xExponentPushToken[abc]"):
            with self.subTest(token=bad):
                self.assertEqual(self.follow(bad).status_code, 400)
        self.assertEqual(Follower.objects.count(), 0)


class AppNotificationTest(InteractionsTestCase):
    def follow(self, token):
        follows.follow(Device.objects.create(token_hash=token[-64:].rjust(64, "0")), expo_token=token)
        return MobilePushToken.objects.get(token=token)

    def test_a_new_post_is_announced_to_browsers_and_phones(self):
        with mock.patch(NOTIFY) as web, mock.patch(APP_NOTIFY) as app, self.captureOnCommitCallbacks(execute=True):
            post = posts.create_post(self.admin, "Texte", [])
        web.assert_called_once_with(post.id, 0)
        app.assert_called_once_with(post.id, 0)

    def test_sends_to_each_phone_in_batches_and_checks_receipts_later(self):
        first = self.follow("ExponentPushToken[a]")
        self.follow("ExponentPushToken[b]")
        with override_settings(EXPO_PUSH_BATCH_SIZE=1, EXPO_RECEIPT_DELAY_SECONDS=900), \
                mock.patch(EXPO, side_effect=ok_tickets) as expo, mock.patch(APP_NOTIFY) as next_batch, \
                mock.patch(RECEIPTS) as receipts:
            result = follows.send_app_notifications(self.post.id)
        self.assertEqual(result, {"sent": 1, "gone": 0})
        self.assertEqual(expo.call_args.kwargs["json"], [{
            "to": "ExponentPushToken[a]", "title": "GenZ", "body": "Bonjour <b>tout le monde</b>",
            "data": {"url": f"/publication/{self.post.id}"}, "sound": "default", "ttl": settings.PUSH_TTL_SECONDS,
        }])
        next_batch.assert_called_once_with(self.post.id, first.id)
        receipts.assert_called_once_with(({"ticket-ExponentPushToken[a]": first.id},), countdown=900)

    def test_uninstalled_apps_are_only_logged_until_pruning_is_switched_on(self):
        token = self.follow("ExponentPushToken[a]")
        gone = expo_answer(data=[{"status": "error", "details": {"error": "DeviceNotRegistered"}}])
        with mock.patch(EXPO, return_value=gone), self.assertLogs("utils.interactions.follows", "WARNING") as logs:
            self.assertEqual(follows.send_app_notifications(self.post.id)["gone"], 1)
        self.assertIn("log-only", logs.output[0])
        late = expo_answer(data={"ticket-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                                 "ticket-2": {"status": "ok"}})
        with override_settings(PUSH_PRUNE_APPLY=True), self.assertLogs("utils.interactions.follows", "WARNING"), \
                mock.patch(EXPO, return_value=late):
            self.assertEqual(follows.check_app_receipts({"ticket-1": token.id, "ticket-2": 999}), {"gone": 1})
        self.assertEqual(MobilePushToken.objects.count(), 0)

    def test_one_refused_token_cannot_block_the_others(self):
        for name in ("a", "b", "c"):
            self.follow(f"ExponentPushToken[{name}]")
        bad = "ExponentPushToken[b]"

        def expo(url, json, **kwargs):
            if any(m["to"] == bad for m in json):
                return expo_answer(status=400)
            return ok_tickets(url, json)

        with mock.patch(EXPO, side_effect=expo), mock.patch(RECEIPTS) as receipts, \
                self.assertLogs("utils.interactions.follows", "WARNING") as logs:
            self.assertEqual(follows.send_app_notifications(self.post.id), {"sent": 2, "gone": 0})
        self.assertEqual(set(receipts.call_args.args[0][0]), {"ticket-ExponentPushToken[a]", "ticket-ExponentPushToken[c]"})
        self.assertTrue(any("Refused" in line for line in logs.output))

    def test_refusals_about_our_own_setup_stop_without_splitting(self):
        self.follow("ExponentPushToken[a]")
        self.follow("ExponentPushToken[b]")
        with mock.patch(EXPO, return_value=expo_answer(status=401)) as expo, \
                self.assertLogs("utils.interactions.follows", "WARNING"), self.assertRaises(follows.PushRefused):
            follows.send_app_notifications(self.post.id)
        self.assertEqual(expo.call_count, 1)

    def test_busy_expo_is_retried_with_growing_waits_then_given_up(self):
        self.follow("ExponentPushToken[a]")
        busy = expo_answer(status=503)
        with override_settings(EXPO_PUSH_MAX_RETRIES=2, EXPO_RETRY_BASE_SECONDS=5), mock.patch(RECEIPTS), \
                mock.patch(EXPO, side_effect=[busy, ok_tickets("", [{"to": "ExponentPushToken[a]"}])]) as expo:
            self.assertEqual(send_app_notifications.apply(args=(self.post.id, 0)).get(), {"sent": 1, "gone": 0})
        self.assertEqual(expo.call_count, 2)
        with override_settings(EXPO_PUSH_MAX_RETRIES=2, EXPO_RETRY_BASE_SECONDS=5), \
                mock.patch(EXPO, return_value=busy) as expo, \
                mock.patch.object(send_app_notifications, "retry", wraps=send_app_notifications.retry) as retry:
            result = send_app_notifications.apply(args=(self.post.id, 0))
        self.assertIsInstance(result.result, follows.PushServiceBusy)
        self.assertEqual(expo.call_count, 3)
        self.assertEqual([c.kwargs["countdown"] for c in retry.call_args_list], [5, 10, 20])
