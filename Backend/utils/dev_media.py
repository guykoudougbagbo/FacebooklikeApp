"""Development-only file serving for uploaded photos and videos, with byte ranges.

Django's own `serve` always answers with the whole file. iPhones (the app and Safari) only play a video when
the server answers "Range: bytes=…" requests with just those bytes, so this wraps it. In production the files
come from the storage service, which handles ranges itself.
"""

import re
from pathlib import Path

from django.http import HttpResponse, StreamingHttpResponse
from django.utils._os import safe_join
from django.views import static

RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")
CHUNK_BYTES = 64 * 1024


def _wanted(header, size):
    """(start, end) for a single satisfiable range, None to send everything, or False when unsatisfiable."""
    match = RANGE.match(header.strip()) if header else None
    if match is None:
        # No range, or several ranges at once: sending the whole file is always allowed.
        return None
    first, last = match.groups()
    if first == "" and last == "":
        return None
    if first == "":
        length = int(last)
        if length == 0:
            return False
        return max(size - length, 0), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        return False
    return start, end


def _chunks(fullpath, start, length):
    with fullpath.open("rb") as handle:
        handle.seek(start)
        while length > 0:
            data = handle.read(min(CHUNK_BYTES, length))
            if not data:
                return
            length -= len(data)
            yield data


def serve(request, path, document_root=None):
    response = static.serve(request, path, document_root=document_root)
    if response.status_code != 200:
        return response
    response.headers["Accept-Ranges"] = "bytes"
    fullpath = Path(safe_join(document_root, static.posixpath.normpath(path).lstrip("/")))
    size = fullpath.stat().st_size
    wanted = _wanted(request.META.get("HTTP_RANGE"), size)
    if wanted is None:
        return response
    response.close()
    if wanted is False:
        refused = HttpResponse(status=416)
        refused.headers["Content-Range"] = f"bytes */{size}"
        return refused
    start, end = wanted
    partial = StreamingHttpResponse(_chunks(fullpath, start, end - start + 1), status=206,
                                    content_type=response.headers["Content-Type"])
    partial.headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    partial.headers["Content-Length"] = str(end - start + 1)
    partial.headers["Accept-Ranges"] = "bytes"
    partial.headers["Last-Modified"] = response.headers["Last-Modified"]
    return partial
