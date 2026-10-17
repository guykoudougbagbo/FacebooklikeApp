"""Turns a multipart request into checked media items.

Files arrive in `media` (in display order). For the video at position i, optional fields
`sound_original_<i>` and `sound_music_<i>` (0-100) and a file `music_<i>` set its sound.
"""

from dataclasses import dataclass

from posts.models import PostMedia
from utils.posts import photos, videos


class UploadError(Exception):
    """Raised with a message that is safe to show the admin."""


@dataclass
class NewMedia:
    upload: object
    kind: str
    extension: str
    music: object = None
    music_extension: str = ""
    original_volume: int | None = None
    music_volume: int | None = None


def parse(data, files):
    items = []
    for index, upload in enumerate(files.getlist("media")):
        if videos.is_video(upload):
            items.append(_video(index, upload, data, files))
        else:
            items.append(NewMedia(upload, PostMedia.Kind.PHOTO, photos.check_upload(upload)))
    return items


def parse_ids(data, field):
    raw = data.getlist(field) if hasattr(data, "getlist") else data.get(field, [])
    try:
        return [int(value) for value in raw]
    except (TypeError, ValueError):
        raise UploadError("Liste de médias à retirer invalide.") from None


def _video(index, upload, data, files):
    item = NewMedia(upload, PostMedia.Kind.VIDEO, videos.check_video_upload(upload))
    item.music = files.get(f"music_{index}")
    if item.music is not None:
        item.music_extension = videos.check_music_upload(item.music)
    item.original_volume = _volume(data.get(f"sound_original_{index}"), default=100)
    item.music_volume = _volume(data.get(f"sound_music_{index}"), default=100) if item.music else 0
    return item


def _volume(value, default):
    if value in (None, ""):
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = -1
    if not 0 <= number <= 100:
        raise UploadError("Le volume doit être un nombre entre 0 et 100.")
    return number
