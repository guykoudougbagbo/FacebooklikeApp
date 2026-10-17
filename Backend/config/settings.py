"""
Django settings for the page app.

Every required value comes from the environment (or Backend/.env in development).
A missing value stops the server at startup; see Backend/.env.example for the list.
"""

from pathlib import Path

from dotenv import load_dotenv

from utils.config import require_bool, require_env, require_int, require_list

BASE_DIR = Path(__file__).resolve().parent.parent

# Real environment variables win over the file, so production never reads a stray .env.
load_dotenv(BASE_DIR / ".env", override=False)

SECRET_KEY = require_env("DJANGO_SECRET_KEY")
DEBUG = require_bool("DJANGO_DEBUG")
ALLOWED_HOSTS = require_list("DJANGO_ALLOWED_HOSTS")


# Application definition

INSTALLED_APPS = [
    # First, so `runserver` serves live connections (WebSockets) as well as normal pages.
    'daphne',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.staticfiles',
    'rest_framework',
    'django_otp',
    'django_otp.plugins.otp_totp',
    # After django.contrib.auth, whose post-migrate step creates the permissions accounts relies on.
    'accounts',
    'posts',
    'interactions',
    'messaging',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Live connections: events reach every server process through Redis.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [require_env("CHANNEL_REDIS_URL")]},
    },
}


# Database

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': require_env("POSTGRES_DB"),
        'USER': require_env("POSTGRES_USER"),
        'PASSWORD': require_env("POSTGRES_PASSWORD"),
        'HOST': require_env("POSTGRES_HOST"),
        'PORT': require_int("POSTGRES_PORT"),
    }
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Cache and sessions (shared by every server, so login limits and sessions work behind a load balancer)

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': require_env("REDIS_URL"),
    }
}

SESSION_ENGINE = 'django.contrib.sessions.backends.cached_db'
SESSION_COOKIE_AGE = require_int("SESSION_COOKIE_AGE_SECONDS")


# Accounts and login

LOGIN_PENDING_TTL_SECONDS = require_int("LOGIN_PENDING_TTL_SECONDS")
ADMIN_INVITE_TTL_HOURS = require_int("ADMIN_INVITE_TTL_HOURS")
RECOVERY_CODE_COUNT = require_int("RECOVERY_CODE_COUNT")
OTP_TOTP_ISSUER = require_env("APP_NAME")


# Files. Web photos are public; uploads as received (with their hidden metadata) stay private.

MEDIA_ROOT = BASE_DIR / require_env("MEDIA_ROOT")
MEDIA_URL = require_env("MEDIA_URL")
PHOTO_ORIGINALS_ROOT = BASE_DIR / require_env("PHOTO_ORIGINALS_ROOT")

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
        'OPTIONS': {'location': MEDIA_ROOT, 'base_url': MEDIA_URL},
    },
    'private': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
        'OPTIONS': {'location': PHOTO_ORIGINALS_ROOT},
    },
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


# Posts and photos

POST_MAX_TEXT_LENGTH = require_int("POST_MAX_TEXT_LENGTH")
POST_MAX_MEDIA = require_int("POST_MAX_MEDIA")
PHOTO_MAX_UPLOAD_BYTES = require_int("PHOTO_MAX_UPLOAD_BYTES")
PHOTO_MAX_PIXELS = require_int("PHOTO_MAX_PIXELS")
PHOTO_FEED_MAX_PX = require_int("PHOTO_FEED_MAX_PX")
PHOTO_FULL_MAX_PX = require_int("PHOTO_FULL_MAX_PX")
PHOTO_WEBP_QUALITY = require_int("PHOTO_WEBP_QUALITY")
VIDEO_MAX_UPLOAD_BYTES = require_int("VIDEO_MAX_UPLOAD_BYTES")
VIDEO_MAX_SECONDS = require_int("VIDEO_MAX_SECONDS")
VIDEO_MAX_PX = require_int("VIDEO_MAX_PX")
VIDEO_CRF = require_int("VIDEO_CRF")
VIDEO_AUDIO_BITRATE = require_env("VIDEO_AUDIO_BITRATE")
VIDEO_PROCESSING_TIMEOUT_SECONDS = require_int("VIDEO_PROCESSING_TIMEOUT_SECONDS")
MUSIC_MAX_UPLOAD_BYTES = require_int("MUSIC_MAX_UPLOAD_BYTES")
FFMPEG_BINARY = require_env("FFMPEG_BINARY")
FFPROBE_BINARY = require_env("FFPROBE_BINARY")
POST_PROCESSING_TIMEOUT_SECONDS = require_int("POST_PROCESSING_TIMEOUT_SECONDS")
POST_PROCESSING_MAX_ATTEMPTS = require_int("POST_PROCESSING_MAX_ATTEMPTS")
POST_REPAIR_BATCH_SIZE = require_int("POST_REPAIR_BATCH_SIZE")
# Off until a person has read the repair job's log and switched it on.
POST_REPAIR_APPLY = require_bool("POST_REPAIR_APPLY")


# Visitor interactions

# Public address of the site, used in share previews and notification links.
SITE_URL = require_env("SITE_URL").rstrip("/")
DEVICE_COOKIE_AGE_SECONDS = require_int("DEVICE_COOKIE_AGE_SECONDS")
DEVICE_COOKIE_SECURE = not DEBUG
COMMENT_MAX_LENGTH = require_int("COMMENT_MAX_LENGTH")
COMMENT_NAME_MAX_LENGTH = require_int("COMMENT_NAME_MAX_LENGTH")

# Web Push notifications (VAPID keys identify this site to browsers' push services).
VAPID_PRIVATE_KEY = require_env("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = require_env("VAPID_PUBLIC_KEY")
VAPID_SUBJECT = require_env("VAPID_SUBJECT")
PUSH_TTL_SECONDS = require_int("PUSH_TTL_SECONDS")
PUSH_TIMEOUT_SECONDS = require_int("PUSH_TIMEOUT_SECONDS")
PUSH_BATCH_SIZE = require_int("PUSH_BATCH_SIZE")
# Push services a browser subscription may point to (each also allows its subdomains).
PUSH_ALLOWED_HOSTS = require_list("PUSH_ALLOWED_HOSTS")
# Off until a person has read the log: removing subscriptions that push services report as gone.
PUSH_PRUNE_APPLY = require_bool("PUSH_PRUNE_APPLY")


# Private messages between admins

MESSAGE_MAX_LENGTH = require_int("MESSAGE_MAX_LENGTH")
GROUP_MAX_MEMBERS = require_int("GROUP_MAX_MEMBERS")


# Background worker (Celery)

CELERY_BROKER_URL = require_env("CELERY_BROKER_URL")
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
# Photo jobs can safely run again, so a crashed worker's job is retried instead of lost.
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
# Keeps the schedule in memory, so the worker writes no schedule file to disk.
CELERY_BEAT_SCHEDULER = 'celery.beat:Scheduler'
CELERY_BEAT_SCHEDULE = {
    'repair-stuck-media': {
        'task': 'posts.tasks.repair_stuck_media',
        'schedule': require_int("POST_REPAIR_INTERVAL_SECONDS"),
    },
}


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# API

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    # Every route needs a logged-in user unless its view opts out with a documented reason.
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': 'utils.api.NewestFirstPagination',
    'PAGE_SIZE': require_int("API_PAGE_SIZE"),
    'DEFAULT_THROTTLE_RATES': {
        'login_ip': require_env("THROTTLE_LOGIN_IP_RATE"),
        'login_account': require_env("THROTTLE_LOGIN_ACCOUNT_RATE"),
        'second_step': require_env("THROTTLE_SECOND_STEP_RATE"),
        'invite': require_env("THROTTLE_INVITE_RATE"),
        'comment_device': require_env("THROTTLE_COMMENT_DEVICE_RATE"),
        'comment_ip': require_env("THROTTLE_COMMENT_IP_RATE"),
        'reaction': require_env("THROTTLE_REACTION_RATE"),
        'share': require_env("THROTTLE_SHARE_RATE"),
        'follow': require_env("THROTTLE_FOLLOW_RATE"),
        'message': require_env("THROTTLE_MESSAGE_RATE"),
    },
}


# Security outside development

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# Internationalization

LANGUAGE_CODE = 'fr'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)

STATIC_URL = 'static/'


# Email

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}
