import tempfile
from io import BytesIO
from pathlib import Path
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from accounts.tests.helpers import AccountsTestCase

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


class PostsTestCase(AccountsTestCase):
    """Writes every file to a throwaway folder and never sends jobs to the real worker queue."""

    def setUp(self):
        super().setUp()
        # Tests that check queueing patch this again and inspect their own mock.
        self.enterContext(mock.patch("posts.tasks.process_post_photos.delay"))
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
