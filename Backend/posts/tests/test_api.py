from datetime import timedelta
from unittest import mock

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.tests.helpers import SecureAPIClient
from posts.models import Post, PostMedia
from posts.tests.helpers import as_items, PostsTestCase, make_photo
from utils.posts import posts

FEED = "/api/posts/"
ADMIN_POSTS = "/api/admin/posts/"
DELAY = "posts.tasks.process_post_media.delay"


class CreatePostTest(PostsTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.make_admin()
        self.client.force_login(self.admin)

    def test_text_post_is_public_at_once_and_shows_the_page_not_the_admin(self):
        response = self.client.post(ADMIN_POSTS, {"body": "  Bonjour à tous !\r\nÀ demain.  "})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "published")
        public = SecureAPIClient().get(FEED).json()["results"]
        self.assertEqual(public[0]["body"], "Bonjour à tous !\nÀ demain.")
        self.assertNotIn("author", public[0])

    def test_photo_post_waits_for_processing_then_appears(self):
        with mock.patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(ADMIN_POSTS, {"body": "", "media": [make_photo(), make_photo("PNG")]}, format="multipart")
        self.assertEqual(response.status_code, 201)
        post_id = response.json()["id"]
        delay.assert_called_once_with(post_id)
        self.assertEqual(response.json()["status"], "processing")
        self.assertEqual(SecureAPIClient().get(FEED).json()["results"], [])

        posts.process_post_media(post_id)
        public = SecureAPIClient().get(FEED).json()["results"]
        self.assertEqual(len(public[0]["media"]), 2)
        self.assertTrue(public[0]["media"][0]["feed_url"].startswith("/media/posts/photos/"))

    def test_bad_posts_are_refused_and_leave_no_files(self):
        cases = [
            ({"body": ""}, "Écrivez un texte"),
            ({"body": "x" * 6000}, "dépasse"),
            ({"body": "", "media": [make_photo() for _ in range(11)]}, "maximum 10 photos et vidéos"),
        ]
        for data, message in cases:
            with self.subTest(message=message), override_settings(POST_MAX_TEXT_LENGTH=5000, POST_MAX_MEDIA=10):
                response = self.client.post(ADMIN_POSTS, data, format="multipart")
                self.assertEqual(response.status_code, 400)
                self.assertIn(message, response.json()["detail"])
        not_a_photo = make_photo(name="a.jpg")
        not_a_photo.file.seek(0)
        not_a_photo.file.truncate()
        not_a_photo.file.write(b"plain text")
        not_a_photo.file.seek(0)
        response = self.client.post(ADMIN_POSTS, {"media": [make_photo(), not_a_photo]}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Post.objects.count(), 0)
        self.assertEqual(self.files_in(self.private_dir), [])

    def test_visitors_cannot_post_or_see_admin_details(self):
        visitor = SecureAPIClient()
        self.assertEqual(visitor.post(ADMIN_POSTS, {"body": "spam"}).status_code, 403)
        self.assertEqual(visitor.get(ADMIN_POSTS).status_code, 403)


class ManagePostsTest(PostsTestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_owner()
        self.admin = self.make_admin()
        self.other = self.make_admin("other@example.com")
        with self.captureOnCommitCallbacks(execute=False):
            self.post = posts.create_post(self.admin, "Texte", as_items(make_photo(), make_photo()))
        with self.captureOnCommitCallbacks(execute=True):
            posts.process_post_media(self.post.id)

    def client_for(self, user):
        client = SecureAPIClient()
        client.force_login(user)
        return client

    def test_admin_feed_shows_author_status_and_what_each_person_may_do(self):
        rows = {u: self.client_for(u).get(ADMIN_POSTS).json()["results"][0] for u in (self.admin, self.other, self.owner)}
        self.assertEqual(rows[self.admin]["author"], self.admin.display_name)
        self.assertEqual((rows[self.admin]["can_edit"], rows[self.admin]["can_delete"]), (True, True))
        self.assertEqual((rows[self.other]["can_edit"], rows[self.other]["can_delete"]), (False, False))
        self.assertEqual((rows[self.owner]["can_edit"], rows[self.owner]["can_delete"]), (False, True))

    def test_author_edits_text_removes_and_adds_photos(self):
        first, second = self.post.media.order_by("position")
        removed_files = [first.feed_name, first.full_name]
        with mock.patch(DELAY) as delay, self.captureOnCommitCallbacks(execute=True):
            response = self.client_for(self.admin).patch(
                f"{ADMIN_POSTS}{self.post.id}/",
                {"body": "Texte modifié", "remove_media_ids": [first.id], "media": [make_photo()]},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["body"], "Texte modifié")
        self.assertIsNotNone(body["edited_at"])
        self.assertEqual([p["status"] for p in body["media"]], ["ready", "pending"])
        delay.assert_called_once_with(self.post.id)
        for name in removed_files:
            self.assertFalse((self.public_dir / name).exists())
        self.assertTrue((self.public_dir / second.feed_name).exists())

    def test_only_the_author_can_edit(self):
        for user in (self.other, self.owner):
            response = self.client_for(user).patch(f"{ADMIN_POSTS}{self.post.id}/", {"body": "Piraté"}, format="multipart")
            self.assertEqual(response.status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.body, "Texte")

    def test_edit_respects_photo_limit_and_needs_valid_ids(self):
        with override_settings(POST_MAX_MEDIA=2):
            response = self.client_for(self.admin).patch(f"{ADMIN_POSTS}{self.post.id}/", {"media": [make_photo()]}, format="multipart")
        self.assertEqual(response.status_code, 400)
        response = self.client_for(self.admin).patch(f"{ADMIN_POSTS}{self.post.id}/", {"remove_media_ids": ["abc"]}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_other_admins_cannot_delete_but_the_owner_can_and_files_go(self):
        files = [n for p in self.post.media.all() for n in (p.feed_name, p.full_name)]
        self.assertEqual(self.client_for(self.other).delete(f"{ADMIN_POSTS}{self.post.id}/").status_code, 403)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client_for(self.owner).delete(f"{ADMIN_POSTS}{self.post.id}/").status_code, 204)
        self.assertFalse(Post.objects.filter(pk=self.post.id).exists())
        for name in files:
            self.assertFalse((self.public_dir / name).exists())
        self.assertEqual(self.client_for(self.owner).delete(f"{ADMIN_POSTS}{self.post.id}/").status_code, 404)

    def test_author_can_delete_own_post(self):
        self.assertEqual(self.client_for(self.admin).delete(f"{ADMIN_POSTS}{self.post.id}/").status_code, 204)

    def test_feeds_do_not_query_once_per_post(self):
        def count(client, url):
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(client.get(url).status_code, 200)
            return len(queries)

        admin_client, visitor = self.client_for(self.admin), SecureAPIClient()
        before = (count(visitor, FEED), count(admin_client, ADMIN_POSTS))
        for i in range(5):
            posts.create_post(self.admin, f"Post {i}", as_items())
        self.assertEqual((count(visitor, FEED), count(admin_client, ADMIN_POSTS)), before)


class RepairJobTest(PostsTestCase):
    def setUp(self):
        super().setUp()
        with self.captureOnCommitCallbacks(execute=False):
            self.post = posts.create_post(self.make_admin(), "", as_items(make_photo()))
        self.photo = self.post.media.get()
        PostMedia.objects.filter(pk=self.photo.pk).update(queued_at=timezone.now() - timedelta(hours=1))

    @override_settings(POST_REPAIR_APPLY=False)
    def test_log_only_mode_changes_nothing(self):
        with mock.patch(DELAY) as delay, self.assertLogs("utils.posts.posts", "WARNING") as logs:
            result = posts.repair_stuck_media()
        self.assertEqual(result, {"retried": 0, "failed": 0, "applied": False})
        self.assertIn(f"retry media [{self.photo.id}]", logs.output[0])
        delay.assert_not_called()
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.status, "pending")

    @override_settings(POST_REPAIR_APPLY=True, POST_PROCESSING_MAX_ATTEMPTS=3)
    def test_stuck_photo_is_retried(self):
        with mock.patch(DELAY) as delay, self.assertLogs("utils.posts.posts", "WARNING"), \
                self.captureOnCommitCallbacks(execute=True):
            result = posts.repair_stuck_media()
        self.assertEqual(result["retried"], 1)
        delay.assert_called_once_with(self.post.id)
        self.photo.refresh_from_db()
        self.assertGreater(self.photo.queued_at, timezone.now() - timedelta(minutes=1))

    @override_settings(POST_REPAIR_APPLY=True, POST_PROCESSING_MAX_ATTEMPTS=3)
    def test_photo_that_keeps_failing_is_given_up_and_its_original_deleted(self):
        PostMedia.objects.filter(pk=self.photo.pk).update(attempts=3)
        with mock.patch(DELAY) as delay, self.assertLogs("utils.posts.posts", "WARNING") as logs, \
                self.captureOnCommitCallbacks(execute=True):
            result = posts.repair_stuck_media()
        self.assertEqual(result["failed"], 1)
        self.assertIn(f"delete originals of media [{self.photo.id}]", logs.output[0])
        delay.assert_not_called()
        self.photo.refresh_from_db()
        self.post.refresh_from_db()
        self.assertEqual((self.photo.status, self.post.status), ("failed", "failed"))
        self.assertEqual(self.files_in(self.private_dir), [])

    def test_nothing_stuck_means_nothing_logged(self):
        PostMedia.objects.filter(pk=self.photo.pk).update(queued_at=timezone.now())
        self.assertEqual(posts.repair_stuck_media()["retried"], 0)
