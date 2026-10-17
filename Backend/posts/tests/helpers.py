import tempfile
from io import BytesIO
from pathlib import Path
from unittest import mock

import subprocess

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict
from django.test import override_settings
from PIL import Image

from accounts.tests.helpers import AccountsTestCase
from utils.posts import uploads

ORIENTATION = 0x0112
CAMERA_MAKE = 0x010F


def make_photo(fmt="JPEG", size=(300, 200), orientation=None, name=None, color=(200, 30, 30)):
    image = Image.new("RGBA" if fmt == "PNG" else "RGB", size, color)
    exif = Image.Exif()
    exif[CAMERA_MAKE] = "SecretPhone"
    if orientation:
        exif[ORIENTATION] = orientation
    buffer = BytesIO()
    image.save(buffer, fmt, exif=exif.tobytes()) if fmt in ("JPEG", "WEBP") else image.save(buffer, fmt)
    extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}[fmt]
    return SimpleUploadedFile(name or f"photo.{extension}", buffer.getvalue(), content_type=f"image/{extension}")


def make_video(seconds=2, size="320x240", sound=True, rotate=None, location=True, name="clip.mp4", fmt="mp4"):
    """A real clip made by FFmpeg: test pattern, optional 440 Hz tone, optional phone GPS tag and rotation."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / f"clip.{fmt}"
        args = [settings.FFMPEG_BINARY, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size={size}:rate=10"]
        if sound:
            args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
        args += ["-c:v", "libx264" if fmt == "mp4" else "libvpx-vp9", "-pix_fmt", "yuv420p"]
        args += (["-c:a", "aac"] if fmt == "mp4" else ["-c:a", "libopus"]) if sound else ["-an"]
        if location and fmt == "mp4":
            args += ["-movflags", "use_metadata_tags", "-metadata", "com.apple.quicktime.location.ISO6709=+05.3600-004.0083/"]
        subprocess.run([*args, str(out)], check=True)
        if rotate is not None:
            # A phone filmed sideways: same pixels, plus a "display rotated" marker (an input-side option).
            rotated = Path(tmp) / f"rotated.{fmt}"
            subprocess.run([settings.FFMPEG_BINARY, "-hide_banner", "-loglevel", "error", "-y",
                            "-display_rotation", str(rotate), "-i", str(out), "-c", "copy", str(rotated)], check=True)
            out = rotated
        return SimpleUploadedFile(name, out.read_bytes(), content_type=f"video/{fmt}")


def make_audio(seconds=1, name="musique.mp3"):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "music.mp3"
        subprocess.run([settings.FFMPEG_BINARY, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                        "-i", f"sine=frequency=880:duration={seconds}", str(out)], check=True)
        return SimpleUploadedFile(name, out.read_bytes(), content_type="audio/mpeg")


def as_items(*files, **fields):
    """Parses files (and sound fields) exactly as an upload request would."""
    return uploads.parse(fields, MultiValueDict({"media": list(files), **{k: [v] for k, v in fields.items() if k.startswith("music_")}}))


class PostsTestCase(AccountsTestCase):
    """Writes every file to a throwaway folder and never sends jobs to the real worker queue."""

    def setUp(self):
        super().setUp()
        # Tests that check queueing patch this again and inspect their own mock.
        self.enterContext(mock.patch("posts.tasks.process_post_media.delay"))
        self.enterContext(mock.patch("interactions.tasks.send_post_notifications.delay"))
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.public_dir, self.private_dir = root / "media", root / "private"
        self.enterContext(override_settings(STORAGES={
            "default": {
                "BACKEND": "django.core.files.storage.FileSystemStorage",
                "OPTIONS": {"location": self.public_dir, "base_url": "/media/"},
            },
            "private": {
                "BACKEND": "django.core.files.storage.FileSystemStorage",
                "OPTIONS": {"location": self.private_dir},
            },
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        }))

    def files_in(self, folder):
        return sorted(p for p in folder.rglob("*") if p.is_file()) if folder.exists() else []
