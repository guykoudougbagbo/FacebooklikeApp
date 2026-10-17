import os
import re
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test import SimpleTestCase, TestCase

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

