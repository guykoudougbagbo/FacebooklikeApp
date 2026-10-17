import os
import re
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.core.exceptions import SuspiciousFileOperation
from django.http import Http404
from django.test import RequestFactory, SimpleTestCase, TestCase

from utils import dev_media
from utils.config import require_bool, require_env, require_int, require_list


class RequireEnvTest(SimpleTestCase):
    def test_returns_value(self):
        with mock.patch.dict(os.environ, {"X": " value "}):
            self.assertEqual(require_env("X"), "value")

    def test_missing_fails(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesMessage(ImproperlyConfigured, "Missing required setting X"):
                require_env("X")

    def test_blank_fails(self):
        with mock.patch.dict(os.environ, {"X": "   "}):
            with self.assertRaises(ImproperlyConfigured):
                require_env("X")


class RequireBoolTest(SimpleTestCase):
    def test_true_and_false(self):
        with mock.patch.dict(os.environ, {"A": "TRUE", "B": "false"}):
            self.assertIs(require_bool("A"), True)
            self.assertIs(require_bool("B"), False)

    def test_other_values_fail(self):
        for bad in ("1", "yes", "on", "flase"):
            with self.subTest(bad=bad), mock.patch.dict(os.environ, {"A": bad}):
                with self.assertRaises(ImproperlyConfigured):
                    require_bool("A")


class RequireIntTest(SimpleTestCase):
    def test_number(self):
        with mock.patch.dict(os.environ, {"N": "5432"}):
            self.assertEqual(require_int("N"), 5432)

    def test_not_a_number_fails(self):
        with mock.patch.dict(os.environ, {"N": "54x"}):
            with self.assertRaises(ImproperlyConfigured):
                require_int("N")


class RequireListTest(SimpleTestCase):
    def test_splits_and_trims(self):
        with mock.patch.dict(os.environ, {"L": "a.com, b.com ,"}):
            self.assertEqual(require_list("L"), ["a.com", "b.com"])

    def test_only_commas_fails(self):
        with mock.patch.dict(os.environ, {"L": " , ,"}):
            with self.assertRaises(ImproperlyConfigured):
                require_list("L")


class DatabaseConnectionTest(TestCase):
    def test_uses_postgresql(self):
        self.assertEqual(connection.vendor, "postgresql")
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            self.assertEqual(cursor.fetchone(), (1,))


class CiSettingsTest(SimpleTestCase):
    """Regression for F-006: a new required setting reached GitHub without being added to CI."""

    # Set by a CI step at run time instead of in the job's env block.
    SET_BY_CI_STEP = {"DJANGO_SECRET_KEY", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY"}

    def test_every_required_setting_is_set_in_ci(self):
        example = (settings.BASE_DIR / ".env.example").read_text()
        ci = (Path(settings.BASE_DIR).parent / ".github" / "workflows" / "ci.yml").read_text()
        required = set(re.findall(r"^([A-Z][A-Z0-9_]*)=", example, re.M))
        backend_job = ci[ci.index("  backend:"):ci.index("  frontend:")]
        in_ci = set(re.findall(r"^\s+([A-Z][A-Z0-9_]*):", backend_job, re.M))
        self.assertTrue(required)
        self.assertEqual(sorted(required - in_ci - self.SET_BY_CI_STEP), [])


class DevMediaRangeTest(SimpleTestCase):
    """iPhones only play videos from a server that answers byte-range requests."""

    def setUp(self):
        import tempfile

        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (self.root / "videos").mkdir()
        (self.root / "videos" / "clip.mp4").write_bytes(bytes(range(10)))

    def get(self, path="videos/clip.mp4", range_header=None):
        extra = {"HTTP_RANGE": range_header} if range_header else {}
        return dev_media.serve(RequestFactory().get("/media/" + path, **extra), path, document_root=str(self.root))

    def body(self, response):
        return b"".join(response.streaming_content)

    def test_whole_file_says_ranges_are_accepted(self):
        response = self.get()
        self.assertEqual((response.status_code, response["Accept-Ranges"], response["Content-Type"]), (200, "bytes", "video/mp4"))
        self.assertEqual(self.body(response), bytes(range(10)))

    def test_ranges_get_just_those_bytes(self):
        for header, expected, content_range in [
            ("bytes=0-1", bytes([0, 1]), "bytes 0-1/10"),
            ("bytes=7-", bytes([7, 8, 9]), "bytes 7-9/10"),
            ("bytes=-3", bytes([7, 8, 9]), "bytes 7-9/10"),
            ("bytes=8-50", bytes([8, 9]), "bytes 8-9/10"),
        ]:
            with self.subTest(header=header):
                response = self.get(range_header=header)
                self.assertEqual(response.status_code, 206)
                self.assertEqual(response["Content-Range"], content_range)
                self.assertEqual(response["Content-Length"], str(len(expected)))
                self.assertEqual(self.body(response), expected)

    def test_impossible_ranges_are_refused_and_odd_ones_get_the_whole_file(self):
        refused = self.get(range_header="bytes=10-")
        self.assertEqual((refused.status_code, refused["Content-Range"]), (416, "bytes */10"))
        self.assertEqual(self.get(range_header="bytes=0-1,4-5").status_code, 200)
        self.assertEqual(self.get(range_header="items=0-1").status_code, 200)

    def test_files_outside_the_media_folder_stay_out_of_reach(self):
        with self.assertRaises((Http404, SuspiciousFileOperation)):
            self.get("../../etc/passwd")
        with self.assertRaises(Http404):
            self.get("videos/missing.mp4")

