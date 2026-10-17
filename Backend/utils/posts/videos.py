"""Video and music uploads: check what arrives, then convert in the background worker with FFmpeg."""

import json
import subprocess
import tempfile
import uuid
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image

from utils.posts import photos

# FFmpeg is only ever allowed to read local files of the format we detected, so a crafted
# file can't make it open a playlist, another format's parser, or a network address.
SAFE_INPUT = ["-protocol_whitelist", "file"]


class VideoError(Exception):
    """Raised with a message that is safe to show the admin."""


def sniff_video(head):
    """(FFmpeg demuxer, extension) from a file's first bytes, or None."""
    if head[4:8] == b"ftyp":
        return "mov", "mp4"
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return "matroska", "webm"
    return None


def sniff_music(head):
    if head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "mp3", "mp3"
    if head[4:8] == b"ftyp":
        return "mov", "m4a"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav", "wav"
    if head[:4] == b"OggS":
        return "ogg", "ogg"
    if head[:2] in (b"\xff\xf1", b"\xff\xf9"):
        return "aac", "aac"
    return None


def check_video_upload(upload):
    return _check(upload, sniff_video, settings.VIDEO_MAX_UPLOAD_BYTES, "n'est pas une vidéo MP4, MOV ou WebM.")


def check_music_upload(upload):
    return _check(upload, sniff_music, settings.MUSIC_MAX_UPLOAD_BYTES, "n'est pas un fichier audio MP3, M4A, WAV, OGG ou AAC.")


def is_video(upload):
    head = upload.read(16)
    upload.seek(0)
    return sniff_video(head) is not None


def render_video(original_name, music_name, original_volume, music_volume):
    """Convert to an MP4 that plays everywhere, with the chosen sound mix and no hidden data.

    Returns (video_name, poster_name, width, height, duration_seconds).
    """
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        video_in = _copy_private(original_name, tmp / "input")
        video_format = _sniffed_format(video_in, sniff_video)
        probe = _probe(video_in, video_format)
        duration = float(probe.get("format", {}).get("duration") or 0)
        if not any(s.get("codec_type") == "video" for s in probe.get("streams", [])):
            raise VideoError("Ce fichier ne contient pas d'image vidéo.")
        if duration <= 0:
            raise VideoError("Vidéo illisible.")
        if duration > settings.VIDEO_MAX_SECONDS + 0.5:
            raise VideoError(f"Vidéo trop longue (maximum {settings.VIDEO_MAX_SECONDS} secondes).")
        has_sound = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))

        inputs = [*SAFE_INPUT, "-format_whitelist", video_format, "-f", video_format, "-i", str(video_in)]
        sources = []
        if has_sound and original_volume > 0:
            sources.append(f"[0:a]volume={original_volume / 100:.2f}[original]")
        if music_name and music_volume > 0:
            music_in = _copy_private(music_name, tmp / "music")
            music_format = _sniffed_format(music_in, sniff_music)
            # Loops the music under the whole video; the output stops when the video does.
            inputs += ["-stream_loop", "-1", *SAFE_INPUT, "-format_whitelist", music_format,
                       "-f", music_format, "-i", str(music_in)]
            sources.append(f"[1:a]volume={music_volume / 100:.2f}[music]")

        px = settings.VIDEO_MAX_PX
        graph = [f"[0:v]scale=w='if(gte(iw,ih),min(iw,{px}),-2)':h='if(gte(iw,ih),-2,min(ih,{px}))'[video]"]
        graph += sources
        audio_map = []
        if len(sources) == 2:
            # normalize=0 keeps the volumes exactly as chosen instead of halving both.
            graph.append("[original][music]amix=inputs=2:duration=first:normalize=0[sound]")
            audio_map = ["-map", "[sound]"]
        elif sources:
            audio_map = ["-map", "[original]" if "[original]" in sources[0] else "[music]"]

        video_out = tmp / "output.mp4"
        _run([
            settings.FFMPEG_BINARY, "-hide_banner", "-nostdin", "-y", *inputs,
            "-filter_complex", ";".join(graph), "-map", "[video]", *audio_map,
            "-t", f"{duration:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", str(settings.VIDEO_CRF), "-pix_fmt", "yuv420p",
            *(["-c:a", "aac", "-b:a", settings.VIDEO_AUDIO_BITRATE] if audio_map else ["-an"]),
            # Drops all hidden data (including phone GPS location), chapters, subtitles and data tracks.
            "-map_metadata", "-1", "-map_metadata:s:v", "-1", "-map_metadata:s:a", "-1", "-map_chapters", "-1",
            "-sn", "-dn", "-movflags", "+faststart", str(video_out),
        ])

        result = _probe(video_out, "mov")
        stream = next(s for s in result["streams"] if s.get("codec_type") == "video")
        width, height = int(stream["width"]), int(stream["height"])
        final_duration = float(result["format"]["duration"])

        poster_png = tmp / "poster.png"
        _run([
            settings.FFMPEG_BINARY, "-hide_banner", "-nostdin", "-y", *SAFE_INPUT,
            "-ss", f"{min(1.0, final_duration / 2):.3f}", "-i", str(video_out),
            "-frames:v", "1", "-f", "image2", "-c:v", "png", str(poster_png),
        ])
        with Image.open(poster_png) as poster:
            poster_bytes = photos.webp_bytes(photos.fit(poster.convert("RGB"), settings.PHOTO_FEED_MAX_PX))

        base = f"posts/videos/{uuid.uuid4().hex}"
        with video_out.open("rb") as handle:
            video_name = default_storage.save(f"{base}.mp4", File(handle))
        try:
            poster_name = default_storage.save(f"{base}-poster.webp", ContentFile(poster_bytes))
        except Exception:
            default_storage.delete(video_name)
            raise
    return video_name, poster_name, width, height, final_duration


def _check(upload, sniff, max_bytes, wrong_type):
    name = (upload.name or "fichier")[:60]
    if upload.size > max_bytes:
        raise VideoError(f"« {name} » est trop lourd (maximum {max_bytes // (1024 * 1024)} Mo).")
    head = upload.read(16)
    upload.seek(0)
    found = sniff(head)
    if found is None:
        raise VideoError(f"« {name} » {wrong_type}")
    return found[1]


def _copy_private(name, destination):
    with photos.private_storage().open(name, "rb") as source, destination.open("wb") as target:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            target.write(chunk)
    return destination


def _sniffed_format(path, sniff):
    with path.open("rb") as handle:
        found = sniff(handle.read(16))
    if found is None:
        raise VideoError("Fichier illisible.")
    return found[0]


def _probe(path, file_format):
    output = _run([
        settings.FFPROBE_BINARY, "-v", "error", *SAFE_INPUT, "-format_whitelist", file_format,
        "-f", file_format, "-show_streams", "-show_format", "-of", "json", str(path),
    ])
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        raise VideoError("Vidéo illisible.") from None


def _run(args):
    try:
        done = subprocess.run(
            args, capture_output=True, timeout=settings.VIDEO_PROCESSING_TIMEOUT_SECONDS, check=False,
        )
    except subprocess.TimeoutExpired:
        raise VideoError("La conversion de la vidéo a pris trop de temps.") from None
    if done.returncode != 0:
        raise VideoError("Vidéo illisible.")
    return done.stdout
