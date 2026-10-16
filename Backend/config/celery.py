import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
# Every CELERY_* setting in config/settings.py configures the worker.
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
