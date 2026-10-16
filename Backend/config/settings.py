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
]

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
    # Every route needs a logged-in user unless its view opts out with a documented reason.
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
}


# Security outside development

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True


# Internationalization

LANGUAGE_CODE = 'en-us'

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
