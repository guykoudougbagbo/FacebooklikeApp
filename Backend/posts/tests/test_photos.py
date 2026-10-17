from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from posts.models import Post, PostMedia
from posts.tests.helpers import as_items, CAMERA_MAKE, PostsTestCase, make_photo
from utils.posts import photos, posts


class CheckUploadTest(PostsTestCase):
    def test_accepts_jpeg_png_and_webp(self):
        for fmt, extension in (("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp")):
            with self.subTest(fmt=fmt):
                self.assertEqual(photos.check_upload(make_photo(fmt)), extension)

    def test_rejects_a_file_that_only_pretends_to_be_a_photo(self):
        fake = SimpleUploadedFile("vacances.jpg", b"<script>alert(1)</script>", content_type="image/jpeg")
        with self.assertRaisesMessage(photos.PhotoError, "n'est pas une photo lisible"):
            photos.check_upload(fake)

    def test_rejects_other_image_formats(self):
        with self.assertRaisesMessage(photos.PhotoError, "JPEG, PNG, WebP ou HEIC"):
            photos.check_upload(make_photo("GIF"))

    @override_settings(PHOTO_MAX_UPLOAD_BYTES=100)
    def test_rejects_heavy_files(self):
        with self.assertRaisesMessage(photos.PhotoError, "trop lourde"):
            photos.check_upload(make_photo())

    @override_settings(PHOTO_MAX_PIXELS=1000)
    def test_rejects_huge_pictures(self):
        with self.assertRaisesMessage(photos.PhotoError, "trop grande"):
            photos.check_upload(make_photo(size=(100, 100)))


class ProcessingTest(PostsTestCase):
    def publish(self, *uploads, body=""):
        with self.captureOnCommitCallbacks(execute=False):
            post = posts.create_post(self.make_admin(), body, as_items(*uploads))
        posts.process_post_media(post.id)
        post.refresh_from_db()
        return post

    @override_settings(PHOTO_FULL_MAX_PX=2048, PHOTO_FEED_MAX_PX=1080)
    def test_builds_small_webp_versions_without_hidden_data(self):
        post = self.publish(make_photo(size=(3000, 2000)))
        self.assertEqual(post.status, Post.Status.PUBLISHED)
        photo = post.media.get()
        self.assertEqual((photo.status, photo.width, photo.height), ("ready", 2048, 1365))
        for name, longest in ((photo.full_name, 2048), (photo.feed_name, 1080)):
            with Image.open(self.public_dir / name) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(max(image.size), longest)
                self.assertNotIn(CAMERA_MAKE, image.getexif())
                self.assertFalse(image.info.get("exif"))

    def test_turns_sideways_phone_photos_upright(self):
        # Orientation 6: the camera was held sideways; the stored pixels are 300 wide x 200 tall.
        photo = self.publish(make_photo(size=(300, 200), orientation=6)).media.get()
        self.assertEqual((photo.width, photo.height), (200, 300))

    def test_private_original_is_deleted_once_web_versions_exist(self):
        with self.captureOnCommitCallbacks(execute=True):
            post = self.publish(make_photo())
        self.assertEqual(self.files_in(self.private_dir), [])
        self.assertEqual(post.media.get().original_name, "")
        self.assertEqual(len(self.files_in(self.public_dir)), 2)

    def test_unreadable_photo_fails_and_post_without_text_fails(self):
        with self.captureOnCommitCallbacks(execute=False):
            post = posts.create_post(self.make_admin(), "", as_items(make_photo()))
        photo = post.media.get()
        (self.private_dir / photo.original_name).write_bytes(b"broken")
        posts.process_post_media(post.id)
        post.refresh_from_db()
        self.assertEqual(post.status, Post.Status.FAILED)
        self.assertEqual(PostMedia.objects.get(pk=photo.pk).status, "failed")

    def test_post_with_text_still_publishes_if_a_photo_fails(self):
        with self.captureOnCommitCallbacks(execute=False):
            post = posts.create_post(self.make_admin(), "Bonjour", as_items(make_photo()))
        (self.private_dir / post.media.get().original_name).write_bytes(b"broken")
        posts.process_post_media(post.id)
        post.refresh_from_db()
        self.assertEqual(post.status, Post.Status.PUBLISHED)
