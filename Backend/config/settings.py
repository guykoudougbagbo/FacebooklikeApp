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
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.staticfiles',
    'rest_framework',
    'django_otp',
    'django_otp.plugins.otp_totp',
    # After django.contrib.auth, whose post-migrate step creates the permissions accounts relies on.
    'accounts',
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
