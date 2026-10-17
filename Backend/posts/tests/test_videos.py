import json
import subprocess

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from posts.models import Post, PostMedia
from posts.tests.helpers import PostsTestCase, as_items, make_audio, make_photo, make_video
from utils.posts import posts, uploads, videos

ADMIN_POSTS = "/api/admin/posts/"
LOCATION_TAG = "com.apple.quicktime.location.ISO6709"


class CheckUploadTest(PostsTestCase):
    def test_accepts_mp4_webm_and_music_files(self):
        self.assertEqual(videos.check_video_upload(make_video()), "mp4")
        self.assertEqual(videos.check_video_upload(make_video(fmt="webm", location=False)), "webm")
        self.assertEqual(videos.check_music_upload(make_audio()), "mp3")

    def test_rejects_files_that_only_pretend(self):
        playlist = SimpleUploadedFile("film.mp4", b"#EXTM3U\n#EXTINF:1,\nhttp://evil.example/x.ts\n")
        with self.assertRaisesMessage(videos.VideoError, "n'est pas une vidéo"):
            videos.check_video_upload(playlist)
        with self.assertRaisesMessage(videos.VideoError, "n'est pas un fichier audio"):
            videos.check_music_upload(SimpleUploadedFile("chanson.mp3", b"just text"))

    @override_settings(VIDEO_MAX_UPLOAD_BYTES=100, MUSIC_MAX_UPLOAD_BYTES=100)
    def test_rejects_heavy_files(self):
        with self.assertRaisesMessage(videos.VideoError, "trop lourd"):
            videos.check_video_upload(make_video())
        with self.assertRaisesMessage(videos.VideoError, "trop lourd"):
            videos.check_music_upload(make_audio())


class ParseTest(PostsTestCase):
    def test_sorts_photos_from_videos_and_reads_sound_settings(self):
        photo, video = as_items(make_photo(), make_video(), sound_original_1="40", sound_music_1="70", music_1=make_audio())
        self.assertEqual((photo.kind, photo.original_volume), ("photo", None))
        self.assertEqual((video.kind, video.original_volume, video.music_volume), ("video", 40, 70))
        self.assertIsNotNone(video.music)

    def test_defaults_keep_the_original_sound_and_no_music(self):
        (video,) = as_items(make_video())
        self.assertEqual((video.original_volume, video.music_volume, video.music), (100, 0, None))

    def test_rejects_volumes_outside_0_to_100(self):
        for bad in ("150", "-1", "fort"):
            with self.subTest(bad=bad), self.assertRaisesMessage(uploads.UploadError, "entre 0 et 100"):
                as_items(make_video(), sound_original_0=bad)


@override_settings(VIDEO_MAX_PX=1920)
class ConvertTest(PostsTestCase):
    def setUp(self):
        super().setUp()
        self.author = self.make_admin()

    def publish(self, *files, body="", **fields):
        with self.captureOnCommitCallbacks(execute=True):
            post = posts.create_post(self.author, body, as_items(*files, **fields))
            posts.process_post_media(post.id)
        post.refresh_from_db()
        return post, post.media.get(kind="video")

    def probe(self, name):
        path = self.public_dir / name
        out = subprocess.run([settings.FFPROBE_BINARY, "-v", "error", "-show_streams", "-show_format", "-of", "json",
                              str(path)], capture_output=True, check=True).stdout
        return json.loads(out), path.read_bytes()

    def sound_tracks(self, info):
        return [s for s in info["streams"] if s["codec_type"] == "audio"]

    def test_keeps_sound_plays_everywhere_and_drops_hidden_location(self):
        post, video = self.publish(make_video(seconds=2))
        self.assertEqual((post.status, video.status), ("published", "ready"))
        info, raw = self.probe(video.video_name)
        codecs = {s["codec_type"]: s["codec_name"] for s in info["streams"]}
        self.assertEqual(codecs, {"video": "h264", "audio": "aac"})
        self.assertAlmostEqual(video.duration_seconds, 2, delta=0.2)
        self.assertNotIn(LOCATION_TAG, info["format"].get("tags", {}))
        self.assertNotIn(b"ISO6709", raw)
        # The index sits before the data, so playback starts before the whole file has downloaded.
        self.assertLess(raw.index(b"moov"), raw.index(b"mdat"))
        with Image.open(self.public_dir / video.poster_name) as poster:
            self.assertEqual(poster.format, "WEBP")
        self.assertEqual(self.files_in(self.private_dir), [])

    def test_original_at_zero_and_no_music_means_silent(self):
        _, video = self.publish(make_video(), sound_original_0="0")
        self.assertEqual(self.sound_tracks(self.probe(video.video_name)[0]), [])

    def test_music_replaces_the_sound_and_loops_to_the_videos_length(self):
        _, video = self.publish(make_video(seconds=3), sound_original_0="0", sound_music_0="80", music_0=make_audio(seconds=1))
        info, _ = self.probe(video.video_name)
        self.assertEqual(len(self.sound_tracks(info)), 1)
        self.assertAlmostEqual(float(info["format"]["duration"]), 3, delta=0.3)
        self.assertEqual(self.files_in(self.private_dir), [])

    def test_music_is_added_to_a_video_that_had_no_sound(self):
        _, video = self.publish(make_video(sound=False), music_0=make_audio())
        self.assertEqual(len(self.sound_tracks(self.probe(video.video_name)[0])), 1)

    def test_original_and_music_are_mixed(self):
        _, video = self.publish(make_video(), sound_original_0="100", sound_music_0="30", music_0=make_audio())
        self.assertEqual(len(self.sound_tracks(self.probe(video.video_name)[0])), 1)

    def mean_volume(self, name):
        out = subprocess.run([settings.FFMPEG_BINARY, "-hide_banner", "-i", str(self.public_dir / name),
                              "-af", "volumedetect", "-vn", "-f", "null", "-"], capture_output=True, text=True).stderr
        return float(out.split("mean_volume:")[1].split("dB")[0])

    def test_volume_slider_changes_loudness(self):
        _, loud = self.publish(make_video(), sound_original_0="100")
        _, quiet = self.publish(make_video(), sound_original_0="10")
        # 10% of the amplitude is 20 dB quieter.
        self.assertAlmostEqual(self.mean_volume(loud.video_name) - self.mean_volume(quiet.video_name), 20, delta=2)

    def test_sideways_phone_video_comes_out_upright(self):
        _, video = self.publish(make_video(rotate=90))
        self.assertEqual((video.width, video.height), (240, 320))

    @override_settings(VIDEO_MAX_PX=160)
    def test_large_videos_are_scaled_down(self):
        _, video = self.publish(make_video(size="320x240"))
        self.assertEqual((video.width, video.height), (160, 120))

    def test_webm_is_converted_too(self):
        _, video = self.publish(make_video(fmt="webm", location=False))
        self.assertEqual(video.status, "ready")

    @override_settings(VIDEO_MAX_SECONDS=1)
    def test_too_long_video_fails_and_post_without_text_fails(self):
        post, video = self.publish(make_video(seconds=3))
        self.assertEqual((video.status, post.status), ("failed", "failed"))
        self.assertEqual(self.files_in(self.private_dir), [])

    def test_photos_and_videos_mix_in_one_post_in_order(self):
        post, _ = self.publish(make_photo(), make_video(), body="Les deux")
        self.assertEqual(list(post.media.order_by("position").values_list("kind", "status")),
                         [("photo", "ready"), ("video", "ready")])


class VideoApiTest(PostsTestCase):
    def test_upload_with_sound_settings_then_feed_shows_player_fields(self):
        admin = self.make_admin()
        self.client.force_login(admin)
        response = self.client.post(ADMIN_POSTS, {
            "body": "Vidéo", "media": [make_video()], "sound_original_0": "20", "sound_music_0": "90", "music_0": make_audio(),
        }, format="multipart")
        self.assertEqual(response.status_code, 201)
        item = PostMedia.objects.get()
        self.assertEqual((item.kind, item.original_volume, item.music_volume), ("video", 20, 90))
        self.assertTrue(item.music_original_name)
        self.assertEqual(response.json()["media"][0]["status"], "pending")

        with self.captureOnCommitCallbacks(execute=True):
            posts.process_post_media(Post.objects.get().id)
        public = self.client.get("/api/posts/").json()["results"][0]["media"][0]
        self.assertEqual(public["kind"], "video")
        self.assertTrue(public["video_url"].startswith("/media/posts/videos/"))
        self.assertTrue(public["poster_url"].endswith("-poster.webp"))
        self.assertIsNone(public["feed_url"])

    def test_bad_volume_or_music_is_refused_without_leaving_files(self):
        self.client.force_login(self.make_admin())
        for extra, message in (({"sound_original_0": "500"}, "entre 0 et 100"),
                               ({"music_0": SimpleUploadedFile("x.mp3", b"text")}, "fichier audio")):
            response = self.client.post(ADMIN_POSTS, {"media": [make_video()], **extra}, format="multipart")
            self.assertEqual(response.status_code, 400)
            self.assertIn(message, response.json()["detail"])
        self.assertEqual(Post.objects.count(), 0)
        self.assertEqual(self.files_in(self.private_dir), [])
