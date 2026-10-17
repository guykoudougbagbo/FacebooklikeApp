"""Photo uploads: check what arrives, then build the web versions in the background worker."""

import uuid
from io import BytesIO

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage, storages
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

# Pillow format name -> extension used for the private original.
ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "HEIF": "heic"}
UNREADABLE = (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError)


class PhotoError(Exception):
    """Raised with a message that is safe to show the admin."""


def private_storage():
    return storages["private"]


def check_upload(upload):
    """Confirm the file really is a photo we accept, whatever its name says. Returns the extension to store it with."""
    name = (upload.name or "photo")[:60]
    if upload.size > settings.PHOTO_MAX_UPLOAD_BYTES:
        limit = settings.PHOTO_MAX_UPLOAD_BYTES // (1024 * 1024)
        raise PhotoError(f"« {name} » est trop lourde (maximum {limit} Mo).")
    try:
        with Image.open(upload) as image:
            fmt = image.format
            width, height = image.size
            image.verify()
    except UNREADABLE:
        raise PhotoError(f"« {name} » n'est pas une photo lisible.") from None
    finally:
        upload.seek(0)
    if fmt not in ALLOWED_FORMATS:
        raise PhotoError(f"« {name} » n'est pas au format JPEG, PNG, WebP ou HEIC.")
    if width * height > settings.PHOTO_MAX_PIXELS:
        raise PhotoError(f"« {name} » est trop grande ({width} × {height} pixels).")
    return ALLOWED_FORMATS[fmt]


def save_original(upload, extension):
    return private_storage().save(f"posts/{uuid.uuid4().hex}.{extension}", upload)


def render_web_versions(original_name):
    """Build the feed and full-screen WebP versions. Re-encoding drops all hidden metadata, including GPS location."""
    full_px, feed_px = settings.PHOTO_FULL_MAX_PX, settings.PHOTO_FEED_MAX_PX
    try:
        with private_storage().open(original_name, "rb") as file, Image.open(file) as image:
            if image.width * image.height > settings.PHOTO_MAX_PIXELS:
                raise PhotoError("Photo trop grande.")
            if image.format == "JPEG":
                # Decodes at a reduced scale when the photo is much larger than we need.
                image.draft("RGB", (full_px, full_px))
            upright = ImageOps.exif_transpose(image)
            has_alpha = upright.mode in ("RGBA", "LA") or (upright.mode == "P" and "transparency" in upright.info)
            upright = upright.convert("RGBA" if has_alpha else "RGB")
            full, feed = fit(upright, full_px), fit(upright, feed_px)
    except UNREADABLE:
        raise PhotoError("Photo illisible.") from None

    base = f"posts/photos/{uuid.uuid4().hex}"
    full_name = default_storage.save(f"{base}-full.webp", ContentFile(webp_bytes(full)))
    try:
        feed_name = default_storage.save(f"{base}-feed.webp", ContentFile(webp_bytes(feed)))
    except Exception:
        default_storage.delete(full_name)
        raise
    return feed_name, full_name, full.width, full.height


def delete_files(public_names=(), private_names=()):
    for name in public_names:
        if name:
            default_storage.delete(name)
    for name in private_names:
        if name:
            private_storage().delete(name)


def fit(image, max_px):
    copy = image.copy()
    copy.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    return copy


def webp_bytes(image):
    buffer = BytesIO()
    image.save(buffer, "WEBP", quality=settings.PHOTO_WEBP_QUALITY, method=4)
    return buffer.getvalue()
